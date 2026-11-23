import '../config/api_paths.dart';
import '../models/area.dart';
import '../models/dashboard_summary.dart';
import '../models/report_entry.dart';
import '../models/report_submission_result.dart';
import 'api_client.dart';

/// Read/write access to the EcoTrace evidence and statistics endpoints.
///
/// Every call targets an existing backend route; no business logic is
/// duplicated here.
class ReportService {
  ReportService({required this._api});

  final ApiClient _api;

  /// `GET /api/v1/users/me/activity` — the caller's own report history plus
  /// aggregate counters (requires auth).
  Future<UserActivity> fetchMyActivity() async {
    final Map<String, dynamic> body =
        await _api.getJson(ApiPaths.v1MyActivity);
    return UserActivity.fromJson(body);
  }

  /// `GET /api/v1/reports/feed` — the public, recently verified feed.
  Future<List<ReportEntry>> fetchFeed() async {
    final Map<String, dynamic> body = await _api.getJson(ApiPaths.v1Feed);
    return _entries(body['reports']);
  }

  /// `GET /api/v1/sites` — clustered waste hotspots for the map/dashboard.
  Future<List<ReportEntry>> fetchSites() async {
    final Map<String, dynamic> body = await _api.getJson(ApiPaths.v1Sites);
    return _entries(body['sites']);
  }

  /// `GET /api/areas/:kind` — cleanliness scorecards for `ward`/`mla`/`mp`.
  Future<List<Area>> fetchAreas(String kind) async {
    final Map<String, dynamic> body = await _api.getJson(ApiPaths.areas(kind));
    final List<dynamic> raw = body['areas'] as List<dynamic>? ?? <dynamic>[];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(Area.fromJson)
        .toList();
  }

  /// `POST /api/v1/reports` — uploads one media file through the AI pipeline.
  ///
  /// The backend runs classification synchronously, so this call can take tens
  /// of seconds; the caller surfaces upload/processing state.
  ///
  /// Throws [ApiException] with `isAiRejected` for `422 INVALID_TRASH` and
  /// `isAiUnavailable` for `503`.
  Future<ReportSubmissionResult> submitReport({
    required List<int> imageBytes,
    required String filename,
    required String contentType,
    required String mediaType,
    required double lat,
    required double lng,
    required double accuracy,
    required String capturedAt,
    required String notes,
  }) async {
    final Map<String, String> fields = <String, String>{
      'media_type': mediaType,
      'lat': lat.toString(),
      'lng': lng.toString(),
      'accuracy': accuracy.toStringAsFixed(2),
      'captured_at': capturedAt,
      'notes': notes,
    };

    final Map<String, dynamic> body = await _api.postMultipart(
      ApiPaths.v1Reports,
      fields: fields,
      file: FileUpload(
        field: 'media',
        bytes: imageBytes,
        filename: filename,
        contentType: contentType,
      ),
    );

    return ReportSubmissionResult.fromJson(body);
  }

  static List<ReportEntry> _entries(dynamic raw) {
    if (raw is! List) return <ReportEntry>[];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(ReportEntry.fromJson)
        .toList();
  }
}
