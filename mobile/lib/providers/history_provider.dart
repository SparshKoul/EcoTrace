import 'package:flutter/foundation.dart';

import '../models/api_exception.dart';
import '../models/report_entry.dart';
import '../services/report_service.dart';
import 'app_change_notifier.dart';

/// Owns the "My reports" list backed by `/api/v1/users/me/activity`.
class HistoryProvider extends AppChangeNotifier {
  HistoryProvider({required ReportService reportService})
      : _reports = reportService;

  final ReportService _reports;

  bool _loading = false;
  bool _loaded = false;
  String? _error;
  List<ReportEntry> _items = const <ReportEntry>[];

  bool get loading => _loading;
  bool get loaded => _loaded;
  String? get error => _error;
  List<ReportEntry> get items => _items;
  bool get isEmpty => _loaded && _items.isEmpty;

  Future<void> load({bool force = false}) async {
    if (_loading || (_loaded && !force)) return;
    _loading = true;
    _error = null;
    notify();

    try {
      final activity = await _reports.fetchMyActivity();
      _items = activity.activity;
      _loaded = true;
    } on ApiException catch (error) {
      _error = error.message;
    } catch (error) {
      _error = 'Could not load your reports.';
      debugPrint('History load failed: $error');
    } finally {
      _loading = false;
      notify();
    }
  }

  Future<void> refresh() => load(force: true);

  /// Looks up a single entry for the detail screen.
  ReportEntry? byId(String id) {
    for (final ReportEntry item in _items) {
      if (item.id == id) return item;
    }
    return null;
  }
}
