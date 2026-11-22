import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';

import '../config/app_config.dart';
import '../models/api_exception.dart';
import '../models/report_submission_result.dart';
import '../services/location_service.dart';
import '../services/report_service.dart';
import 'app_change_notifier.dart';

/// Overall state of the report-capture flow.
enum CapturePhase {
  /// Editing: image/GPS/notes can still change.
  idle,

  /// A request is in flight (upload + AI classification).
  working,

  /// Accepted and stored; classification and letter are available.
  succeeded,

  /// The AI judge rejected the image as non-waste (HTTP 422).
  rejected,

  /// Transport, validation or server failure.
  failed,
}

/// The picked photo, already downscaled and JPEG-encoded by `image_picker`.
class CapturedImage {
  const CapturedImage({
    required this.bytes,
    required this.filename,
    required this.contentType,
  });

  final Uint8List bytes;
  final String filename;
  final String contentType;
}

/// Drives the waste-report screen: image capture, GPS acquisition, notes and
/// submission through `POST /api/v1/reports`.
class CaptureProvider extends AppChangeNotifier {
  CaptureProvider({
    required ReportService reportService,
    required LocationService locationService,
  }) : _reports = reportService,
       _location = locationService;

  final ReportService _reports;
  final LocationService _location;
  final ImagePicker _picker = ImagePicker();

  CapturedImage? _image;
  GpsFix? _fix;
  String _notes = '';

  CapturePhase _phase = CapturePhase.idle;
  String _workingLabel = '';
  String? _submitError;
  ReportSubmissionResult? _result;

  String? _locationError;
  LocationSettingsTarget _locationTarget = LocationSettingsTarget.none;

  // --- Getters -------------------------------------------------------------

  CapturedImage? get image => _image;
  bool get hasImage => _image != null;
  GpsFix? get fix => _fix;
  bool get hasFix => _fix != null;
  String get notes => _notes;

  CapturePhase get phase => _phase;
  String get workingLabel => _workingLabel;
  String? get submitError => _submitError;
  ReportSubmissionResult? get result => _result;
  String? get locationError => _locationError;
  LocationSettingsTarget get locationTarget => _locationTarget;

  bool get isBusy => _phase == CapturePhase.working;

  /// True when the captured fix meets FR-1.2 (≤ 30 m, ≤ 2 min old).
  bool get hasUsableFix =>
      _fix != null &&
      _fix!.isUsable(
        maxAccuracyM: AppConfig.gpsMaxAccuracyM,
        maxAge: AppConfig.gpsMaxAge,
      );

  bool get canSubmit => hasImage && hasUsableFix && !isBusy;

  /// Human summary of the current GPS state for the status chip.
  String get gpsLabel {
    if (_fix == null) return 'No GPS fix';
    return '±${_fix!.accuracyM.toStringAsFixed(0)} m';
  }

  // --- Capture -------------------------------------------------------------

  Future<void> pickFromCamera() async {
    try {
      final XFile? file = await _picker.pickImage(
        source: ImageSource.camera,
        maxWidth: AppConfig.captureMaxWidth,
        imageQuality: AppConfig.captureJpegQuality,
      );
      if (file == null) return; // user cancelled the picker
      final Uint8List bytes = await file.readAsBytes();
      _image = CapturedImage(
        bytes: bytes,
        filename: 'evidence.jpg',
        contentType: 'image/jpeg',
      );
      _clearOutcome();
      notify();
    } catch (error) {
      _submitError =
          'Could not access the camera. Check app permissions and try again.';
      _phase = CapturePhase.failed;
      notify();
      debugPrint('Image pick failed: $error');
    }
  }

  // --- GPS -----------------------------------------------------------------

  Future<void> locate() async {
    _workingLabel = 'Getting your location…';
    if (_phase == CapturePhase.idle) {
      _phase = CapturePhase.working;
      notify();
    } else {
      notify();
    }

    try {
      _fix = await _location.getCurrentFix();
      _locationError = null;
      _locationTarget = LocationSettingsTarget.none;
    } on LocationServiceException catch (error) {
      _fix = null;
      _locationError = error.message;
      _locationTarget = error.target;
    } catch (error) {
      _fix = null;
      _locationError = 'Could not obtain a GPS fix. Please try again.';
      _locationTarget = LocationSettingsTarget.none;
      debugPrint('Locate failed: $error');
    }

    if (_phase == CapturePhase.working &&
        _workingLabel == 'Getting your location…') {
      _phase = CapturePhase.idle;
    }
    _workingLabel = '';
    notify();
  }

  Future<void> openLocationSettings() =>
      _location.openSettings(_locationTarget);

  // --- Notes ---------------------------------------------------------------

  void setNotes(String value) {
    if (value == _notes) return;
    _notes = value;
    notify();
  }

  // --- Submission ----------------------------------------------------------

  /// Uploads the photo and runs the AI pipeline. Returns `true` on success.
  Future<bool> submit() async {
    if (isBusy) return false;

    if (_image == null) {
      _fail('Take or choose a photo before submitting.');
      return false;
    }

    // Acquire a fix on demand if the user skipped the prompt.
    if (_fix == null) await locate();

    if (_fix == null) {
      _fail(_locationError ?? 'A GPS fix is required to file a report.');
      return false;
    }
    if (!hasUsableFix) {
      _fail(
        'GPS accuracy is ±${_fix!.accuracyM.toStringAsFixed(0)} m. '
        'EcoTrace needs ±${AppConfig.gpsMaxAccuracyM.toStringAsFixed(0)} m or better — '
        'move to an open area and retry.',
      );
      return false;
    }

    _phase = CapturePhase.working;
    _workingLabel = 'Uploading and classifying with AI…';
    _submitError = null;
    _result = null;
    notify();

    try {
      final ReportSubmissionResult result = await _reports.submitReport(
        imageBytes: _image!.bytes,
        filename: _image!.filename,
        contentType: _image!.contentType,
        mediaType: 'photo',
        lat: _fix!.lat,
        lng: _fix!.lng,
        accuracy: _fix!.accuracyM,
        capturedAt: DateTime.now().toIso8601String(),
        notes: _notes.trim(),
      );
      _result = result;
      _phase = CapturePhase.succeeded;
      return true;
    } on ApiException catch (error) {
      if (error.isAiRejected) {
        _phase = CapturePhase.rejected;
        _submitError = error.message;
      } else {
        _phase = CapturePhase.failed;
        _submitError = error.message;
      }
      notify();
      return false;
    } catch (error) {
      _phase = CapturePhase.failed;
      _submitError =
          'The report could not be submitted. Check your connection and retry.';
      debugPrint('Submit failed: $error');
      notify();
      return false;
    } finally {
      _workingLabel = '';
      notify();
    }
  }

  void _fail(String message) {
    _phase = CapturePhase.failed;
    _submitError = message;
    _workingLabel = '';
    notify();
  }

  void _clearOutcome() {
    if (_phase != CapturePhase.idle) {
      _phase = CapturePhase.idle;
      _submitError = null;
      _result = null;
    }
  }

  /// Returns to the editing state, keeping the photo and GPS fix.
  void reset() {
    _phase = CapturePhase.idle;
    _workingLabel = '';
    _submitError = null;
    _result = null;
    notify();
  }

  /// Full reset (used after a successful submission when starting a new one).
  void clearAll() {
    _image = null;
    _fix = null;
    _notes = '';
    _locationError = null;
    _locationTarget = LocationSettingsTarget.none;
    reset();
  }
}
