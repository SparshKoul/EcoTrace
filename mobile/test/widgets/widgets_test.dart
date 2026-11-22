import 'package:ecotrace/config/app_theme.dart';
import 'package:ecotrace/models/report_entry.dart';
import 'package:ecotrace/widgets/eco_button.dart';
import 'package:ecotrace/widgets/eco_card.dart';
import 'package:ecotrace/widgets/report_tile.dart';
import 'package:ecotrace/widgets/section_header.dart';
import 'package:ecotrace/widgets/state_views.dart';
import 'package:ecotrace/widgets/status_chip.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _wrap(Widget child) => MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(child: child),
      ),
    );

void main() {
  group('EcoButton', () {
    testWidgets('renders the label and fires onPressed', (WidgetTester tester) async {
      bool tapped = false;
      await tester.pumpWidget(
        _wrap(
          EcoButton(
            label: 'Submit report',
            onPressed: () => tapped = true,
          ),
        ),
      );

      expect(find.text('Submit report'), findsOneWidget);
      await tester.tap(find.byType(EcoButton));
      expect(tapped, isTrue);
    });

    testWidgets('is inert while busy and shows the busy label',
        (WidgetTester tester) async {
      bool tapped = false;
      await tester.pumpWidget(
        _wrap(
          EcoButton(
            label: 'Submit report',
            busy: true,
            busyLabel: 'Uploading…',
            onPressed: () => tapped = true,
          ),
        ),
      );

      expect(find.text('Uploading…'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      await tester.tap(find.byType(EcoButton), warnIfMissed: false);
      expect(tapped, isFalse, reason: 'a busy button must not re-fire');
    });

    testWidgets('is inert when onPressed is null', (WidgetTester tester) async {
      await tester.pumpWidget(
        _wrap(const EcoButton(label: 'Submit report', onPressed: null)),
      );

      final ElevatedButton button =
          tester.widget<ElevatedButton>(find.byType(ElevatedButton));
      expect(button.onPressed, isNull);
    });

    testWidgets('renders the leading icon when one is given',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        _wrap(
          EcoButton(
            label: 'Report waste',
            icon: Icons.add_a_photo_rounded,
            onPressed: () {},
          ),
        ),
      );
      expect(find.byIcon(Icons.add_a_photo_rounded), findsOneWidget);
    });

    testWidgets('expands to the full width by default',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        _wrap(EcoButton(label: 'Wide', onPressed: () {})),
      );
      final Size size = tester.getSize(find.byType(EcoButton));
      expect(size.width, greaterThan(300));
    });

    testWidgets('stays intrinsic-width when expand is false',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        _wrap(
          EcoButton(label: 'Narrow', expand: false, onPressed: () {}),
        ),
      );
      final Size size = tester.getSize(find.byType(EcoButton));
      expect(size.width, lessThan(300));
    });
  });

  group('EcoCard', () {
    testWidgets('renders its child without a tap handler',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        _wrap(const EcoCard(child: Text('Card body'))),
      );
      expect(find.text('Card body'), findsOneWidget);
      expect(find.byType(InkWell), findsNothing);
    });

    testWidgets('becomes tappable when onTap is provided',
        (WidgetTester tester) async {
      bool tapped = false;
      await tester.pumpWidget(
        _wrap(
          EcoCard(
            onTap: () => tapped = true,
            child: const Text('Card body'),
          ),
        ),
      );
      await tester.tap(find.byType(EcoCard));
      expect(tapped, isTrue);
    });
  });

  group('state views', () {
    testWidgets('LoadingView shows the message', (WidgetTester tester) async {
      await tester.pumpWidget(
        _wrap(const LoadingView(message: 'Loading your dashboard…')),
      );
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Loading your dashboard…'), findsOneWidget);
    });

    testWidgets('ErrorView surfaces the message and invokes retry',
        (WidgetTester tester) async {
      bool retried = false;
      await tester.pumpWidget(
        _wrap(
          ErrorView(
            message: 'Could not reach the server.',
            onRetry: () => retried = true,
          ),
        ),
      );

      expect(find.text('Something went wrong'), findsOneWidget);
      expect(find.text('Could not reach the server.'), findsOneWidget);

      await tester.tap(find.text('Try again'));
      expect(retried, isTrue);
    });

    testWidgets('ErrorView omits retry when no handler is given',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        _wrap(const ErrorView(message: 'Boom')),
      );
      expect(find.text('Try again'), findsNothing);
    });

    testWidgets('EmptyView shows title, message and the action',
        (WidgetTester tester) async {
      bool acted = false;
      await tester.pumpWidget(
        _wrap(
          EmptyView(
            icon: Icons.inbox_outlined,
            title: 'No reports yet',
            message: 'Reports you file appear here.',
            actionLabel: 'File a report',
            onAction: () => acted = true,
          ),
        ),
      );

      expect(find.text('No reports yet'), findsOneWidget);
      expect(find.text('Reports you file appear here.'), findsOneWidget);
      await tester.tap(find.text('File a report'));
      expect(acted, isTrue);
    });

    testWidgets('InlineBanner renders and can be dismissed',
        (WidgetTester tester) async {
      bool dismissed = false;
      await tester.pumpWidget(
        _wrap(
          InlineBanner(
            message: 'Location unavailable',
            onDismiss: () => dismissed = true,
          ),
        ),
      );

      expect(find.text('Location unavailable'), findsOneWidget);
      await tester.tap(find.byIcon(Icons.close_rounded));
      expect(dismissed, isTrue);
    });
  });

  group('StatusChip', () {
    testWidgets('maps known statuses to labels', (WidgetTester tester) async {
      await tester.pumpWidget(
        _wrap(
          const Column(
            children: <Widget>[
              StatusChip(status: 'verified'),
              StatusChip(status: 'needs_review'),
              StatusChip(status: 'cleaned'),
              StatusChip(status: 'reopened'),
            ],
          ),
        ),
      );

      expect(find.text('VERIFIED'), findsOneWidget);
      expect(find.text('REVIEW'), findsOneWidget);
      expect(find.text('CLEANED'), findsOneWidget);
      expect(find.text('REOPENED'), findsOneWidget);
    });

    testWidgets('falls back to a readable label for unknown statuses',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        _wrap(const StatusChip(status: 'brand_new_state')),
      );
      expect(find.text('BRAND_NEW_STATE'), findsOneWidget);
    });

    testWidgets('renders a placeholder for a null status',
        (WidgetTester tester) async {
      await tester.pumpWidget(_wrap(const StatusChip(status: null)));
      expect(find.text('UNKNOWN'), findsOneWidget);
    });
  });

  group('CategoryChip', () {
    testWidgets('shows the human label for an AI category',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        _wrap(const CategoryChip(category: 'construction_debris')),
      );
      expect(find.text('CONSTRUCTION DEBRIS'), findsOneWidget);
    });

    testWidgets('shows a fallback for a missing category',
        (WidgetTester tester) async {
      await tester.pumpWidget(_wrap(const CategoryChip(category: null)));
      expect(find.text('UNCLASSIFIED'), findsOneWidget);
    });
  });

  group('ReportTile', () {
    ReportEntry entry({String? category, String? status}) => ReportEntry(
          id: 'r1',
          siteId: 's1',
          mediaType: 'photo',
          trashCategory: category ?? 'wet_organic',
          severity: 3,
          piiBlurCount: 1,
          publicAuditSummary: 'Organic waste piled beside the drain.',
          lat: 12.9716,
          lng: 77.5946,
          capturedAt: '2026-11-12T14:30:00Z',
          status: status ?? 'verified',
          reportCount: 2,
        );

    testWidgets('shows the AI summary, category and status',
        (WidgetTester tester) async {
      await tester.pumpWidget(_wrap(ReportTile(entry: entry())));

      expect(find.text('Organic waste piled beside the drain.'), findsOneWidget);
      expect(find.text('WET / ORGANIC'), findsOneWidget);
      expect(find.text('VERIFIED'), findsOneWidget);
      expect(find.textContaining('12.9716'), findsOneWidget);
    });

    testWidgets('falls back to the category when there is no summary',
        (WidgetTester tester) async {
      final ReportEntry bare = ReportEntry(
        id: 'r2',
        siteId: 's2',
        mediaType: 'photo',
        trashCategory: 'mixed_municipal',
        severity: 1,
        piiBlurCount: 0,
        publicAuditSummary: '',
        lat: 0,
        lng: 0,
        reportCount: 0,
      );

      await tester.pumpWidget(_wrap(ReportTile(entry: bare)));
      expect(find.text('Mixed municipal'), findsOneWidget);
    });

    testWidgets('invokes onTap', (WidgetTester tester) async {
      bool opened = false;
      await tester.pumpWidget(
        _wrap(ReportTile(entry: entry(), onTap: () => opened = true)),
      );
      await tester.tap(find.byType(ReportTile));
      expect(opened, isTrue);
    });
  });

  group('SectionHeader', () {
    testWidgets('renders title, subtitle and the trailing action',
        (WidgetTester tester) async {
      bool acted = false;
      await tester.pumpWidget(
        _wrap(
          SectionHeader(
            title: 'Recent reports',
            subtitle: 'Your latest submissions',
            actionLabel: 'See all',
            onAction: () => acted = true,
          ),
        ),
      );

      expect(find.text('Recent reports'), findsOneWidget);
      expect(find.text('Your latest submissions'), findsOneWidget);
      await tester.tap(find.text('See all'));
      expect(acted, isTrue);
    });

    testWidgets('omits the action when no handler is given',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        _wrap(const SectionHeader(title: 'Details')),
      );
      expect(find.text('See all'), findsNothing);
    });
  });

  group('branding', () {
    test('uses the EcoTrace palette tokens', () {
      expect(EcoColors.page, const Color(0xFFFBF6EE));
      expect(EcoColors.surface, const Color(0xFFFFFDF8));
      expect(EcoColors.accent, const Color(0xFF0B7A73));
      expect(EcoColors.ink, const Color(0xFF221C15));
      expect(EcoRadius.card, 16);
      expect(EcoRadius.sheet, 28);
    });

    test('category colours are stable', () {
      expect(EcoColors.forCategory('mixed_municipal'), EcoColors.accent);
      expect(EcoColors.forCategory('dry_plastic_paper'), EcoColors.water);
      expect(EcoColors.forCategory('wet_organic'), EcoColors.construction);
      expect(EcoColors.forCategory('construction_debris'), EcoColors.noBin);
      expect(EcoColors.forCategory('sanitary_biomedical'), EcoColors.overflow);
      expect(EcoColors.forCategory('special_care_ewaste_hazardous'), EcoColors.dump);
      expect(EcoColors.forCategory('none'), EcoColors.muted);
      // Unknown / missing categories share the default accent.
      expect(EcoColors.forCategory(null), EcoColors.accent);
      expect(EcoColors.forCategory('something_new'), EcoColors.accent);
    });
  });
}
