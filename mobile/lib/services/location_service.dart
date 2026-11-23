import 'package:geolocator/geolocator.dart';

/// A single GPS fix accepted for submission.
class GpsFix {
  const GpsFix({
    required this.lat,
    required this.lng,
    required this.accuracyM,
    required this.timestamp,
  });

  final double lat;
  final double lng;

  /// Horizontal accuracy in metres (lower is better).
  final double accuracyM;
  final DateTime timestamp;

  /// True when the fix is recent enough and accurate enough to submit.
  bool isUsable({required double maxAccuracyM, required Duration maxAge}) {
    final DateTime now = DateTime.now();
    return accuracyM <= maxAccuracyM &&
        timestamp.isAfter(now.subtract(maxAge));
  }

  @override
  String toString() =>
      'GpsFix(${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}, ±${accuracyM.toStringAsFixed(1)}m)';
}

/// Where the user must go to resolve a location problem.
enum LocationSettingsTarget { none, app, system }

/// A location failure that needs user action (permission or service disabled).
class LocationServiceException implements Exception {
  const LocationServiceException(this.message,
      {this.target = LocationSettingsTarget.none});

  final String message;
  final LocationSettingsTarget target;

  @override
  String toString() => message;
}

/// Wraps `geolocator` with the permission and service-enablement flow the
/// report screen needs, translating platform outcomes into actionable errors.
class LocationService {
  const LocationService();

  /// Obtains a fresh GPS fix, requesting permission when necessary.
  ///
  /// Throws [LocationServiceException] when location services are off, the
  /// permission is denied, or the fix cannot be obtained.
  Future<GpsFix> getCurrentFix() async {
    bool serviceEnabled = false;
    try {
      serviceEnabled = await Geolocator.isLocationServiceEnabled();
    } catch (cause) {
      throw LocationServiceException(
          'Location is unavailable on this device (${cause.toString()}).');
    }

    if (!serviceEnabled) {
      throw const LocationServiceException(
        'Location services are turned off. Enable them to file a GPS-tagged report.',
        target: LocationSettingsTarget.system,
      );
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    switch (permission) {
      case LocationPermission.denied:
        throw const LocationServiceException(
          'Location permission was denied. Grant it to attach coordinates to your report.',
          target: LocationSettingsTarget.app,
        );
      case LocationPermission.deniedForever:
        throw const LocationServiceException(
          'Location permission is permanently denied. Enable it in app settings to continue.',
          target: LocationSettingsTarget.app,
        );
      case LocationPermission.unableToDetermine:
        throw const LocationServiceException(
          'Could not determine location permission. Please try again.',
          target: LocationSettingsTarget.app,
        );
      case LocationPermission.whileInUse:
      case LocationPermission.always:
        break;
    }

    try {
      final Position position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 25),
        ),
      );
      return GpsFix(
        lat: position.latitude,
        lng: position.longitude,
        accuracyM: position.accuracy,
        timestamp: position.timestamp,
      );
    } on LocationServiceException {
      rethrow;
    } catch (cause) {
      throw LocationServiceException(
        'Could not obtain a GPS fix. Move to an open area and retry (${cause.runtimeType}).',
      );
    }
  }

  /// Opens the right settings screen for the given failure target.
  Future<void> openSettings(LocationSettingsTarget target) async {
    switch (target) {
      case LocationSettingsTarget.app:
        await Geolocator.openAppSettings();
      case LocationSettingsTarget.system:
        await Geolocator.openLocationSettings();
      case LocationSettingsTarget.none:
        break;
    }
  }
}
