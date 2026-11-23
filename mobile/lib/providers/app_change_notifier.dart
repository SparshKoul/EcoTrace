import 'package:flutter/foundation.dart';

/// A [ChangeNotifier] that tolerates async gaps.
///
/// Providers kick off network calls; if the widget tree is torn down while one
/// is in flight, calling `notifyListeners()` would assert. Subclasses call
/// [notify] instead, which becomes a no-op after [dispose].
abstract class AppChangeNotifier extends ChangeNotifier {
  bool _disposed = false;

  bool get isDisposed => _disposed;

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  /// Safe wrapper around `notifyListeners()`.
  void notify() {
    if (!_disposed) notifyListeners();
  }
}
