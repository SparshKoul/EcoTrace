/// The verified civic complaint letter attached to a freshly submitted report
/// (`letter` in the `POST /api/v1/reports` response), produced by the
/// backend's zero-hallucination drafting engine.
class ComplaintLetter {
  const ComplaintLetter({
    required this.siteId,
    required this.recipient,
    required this.cc,
    required this.subject,
    required this.body,
    required this.citations,
    required this.generatedAt,
    this.templateFallback = false,
    this.verifiedQuotes = 0,
    this.totalQuotes = 0,
  });

  final String siteId;
  final String recipient;
  final List<String> cc;
  final String subject;
  final String body;

  /// Every quoted rule has passed the backend's exact-substring verification.
  final List<String> citations;
  final String generatedAt;
  final bool templateFallback;
  final int verifiedQuotes;
  final int totalQuotes;

  bool get hasVerifiedCitations => citations.isNotEmpty && !templateFallback;

  factory ComplaintLetter.fromJson(Map<String, dynamic> json) {
    final List<String> citations = (json['citations'] as List<dynamic>? ?? [])
        .map((dynamic c) {
          if (c is String) return c;
          if (c is Map<String, dynamic> && c['quote'] is String) {
            return c['quote'] as String;
          }
          return null;
        })
        .whereType<String>()
        .toList();

    final Map<String, dynamic>? verifier =
        json['verifier'] is Map<String, dynamic>
            ? json['verifier'] as Map<String, dynamic>
            : null;

    return ComplaintLetter(
      siteId: json['site_id'] as String? ?? '',
      recipient: json['to'] as String? ?? '',
      cc: (json['cc'] as List<dynamic>? ?? [])
          .map((dynamic e) => e.toString())
          .toList(),
      subject: json['subject'] as String? ?? '',
      body: json['body'] as String? ?? '',
      citations: citations,
      generatedAt: json['created_at'] as String? ?? '',
      templateFallback: json['template_fallback'] as bool? ?? false,
      verifiedQuotes: verifier?['verified'] is num
          ? (verifier!['verified'] as num).round()
          : 0,
      totalQuotes: verifier?['total'] is num
          ? (verifier!['total'] as num).round()
          : 0,
    );
  }
}
