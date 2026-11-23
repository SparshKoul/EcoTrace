import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../config/app_theme.dart';
import '../../models/report_entry.dart';
import '../../providers/map_provider.dart';
import '../../widgets/state_views.dart';

class MapScreen extends StatelessWidget {
  const MapScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final MapProvider map = context.watch<MapProvider>();
    if (!map.loaded && !map.loading && map.error == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) context.read<MapProvider>().load();
      });
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Waste map'),
        actions: [
          IconButton(
            tooltip: 'Use my location',
            onPressed: map.locate,
            icon: const Icon(Icons.my_location),
          ),
        ],
      ),
      body: map.loading && !map.loaded
          ? const LoadingView(message: 'Loading waste sites…')
          : map.error != null && map.sites.isEmpty
          ? ErrorView(
              message: map.error!,
              onRetry: () => context.read<MapProvider>().refresh(),
            )
          : RefreshIndicator(
              onRefresh: map.refresh,
              child: _MapBody(map: map),
            ),
    );
  }
}

class _MapBody extends StatelessWidget {
  const _MapBody({required this.map});

  final MapProvider map;

  @override
  Widget build(BuildContext context) {
    final LatLng center = map.fix != null
        ? LatLng(map.fix!.lat, map.fix!.lng)
        : const LatLng(30.5157, 76.6592);

    final List<Marker> markers = <Marker>[
      ...map.sites
          .where(
            (ReportEntry site) =>
                site.lat.abs() > 0.000001 && site.lng.abs() > 0.000001,
          )
          .map(
            (ReportEntry site) => Marker(
              point: LatLng(site.lat, site.lng),
              width: 42,
              height: 42,
              child: Tooltip(
                message:
                    '${site.trashCategory.replaceAll('_', ' ')} · severity ${site.severity}/5',
                child: Container(
                  decoration: BoxDecoration(
                    color: EcoColors.forCategory(site.trashCategory),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 3),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    '${site.severity}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ),
          ),
      if (map.fix != null)
        Marker(
          point: LatLng(map.fix!.lat, map.fix!.lng),
          width: 36,
          height: 36,
          child: Container(
            decoration: BoxDecoration(
              color: const Color(0xFF1967D2),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 4),
            ),
          ),
        ),
    ];

    return Stack(
      children: [
        FlutterMap(
          options: MapOptions(initialCenter: center, initialZoom: 13),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.ecotrace.app',
            ),
            MarkerLayer(markers: markers),
          ],
        ),
        if (map.error != null)
          Positioned(
            top: 12,
            left: 12,
            right: 12,
            child: Material(
              color: EcoColors.surface,
              elevation: 2,
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  map.error!,
                  style: const TextStyle(color: EcoColors.dump),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
