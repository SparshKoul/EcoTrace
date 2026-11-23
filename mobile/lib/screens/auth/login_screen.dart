import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../config/app_theme.dart';
import '../../providers/auth_provider.dart';
import '../../utils/validators.dart';
import '../../widgets/app_text_field.dart';
import '../../widgets/eco_button.dart';
import 'register_screen.dart';

/// Email + password sign-in against `POST /api/auth/login`.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final AuthProvider auth = context.read<AuthProvider>();
    final bool ok = await auth.signIn(
      email: _email.text,
      password: _password.text,
    );
    // On success the root widget swaps to the shell automatically.
    if (!ok || !mounted) return;
  }

  Future<void> _goToRegister() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(builder: (_) => const RegisterScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final AuthProvider auth = context.watch<AuthProvider>();

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    const Center(
                      child: Hero(
                        tag: 'ecotrace-logo',
                        child: _BrandMark(),
                      ),
                    ),
                    const SizedBox(height: 28),
                    const Text(
                      'Welcome back',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        color: EcoColors.ink,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Sign in to file and track waste reports',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: EcoColors.muted, fontSize: 14.5),
                    ),
                    const SizedBox(height: 28),
                    if (auth.error != null) ...<Widget>[
                      _ErrorBanner(message: auth.error!),
                      const SizedBox(height: 16),
                    ],
                    AppTextField(
                      controller: _email,
                      label: 'Email',
                      hint: 'you@example.com',
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      autofillHints: const <String>[AutofillHints.email],
                      prefixIcon: Icons.mail_outline_rounded,
                      validator: Validators.email,
                      onChanged: (_) => auth.clearError(),
                    ),
                    const SizedBox(height: 16),
                    AppTextField(
                      controller: _password,
                      label: 'Password',
                      hint: 'Your password',
                      obscureText: _obscure,
                      textInputAction: TextInputAction.done,
                      autofillHints: const <String>[AutofillHints.password],
                      prefixIcon: Icons.lock_outline_rounded,
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscure
                              ? Icons.visibility_off_outlined
                              : Icons.visibility_outlined,
                          size: 20,
                          color: EcoColors.muted,
                        ),
                        onPressed: () => setState(() => _obscure = !_obscure),
                      ),
                      validator: Validators.password,
                      onSubmitted: (_) => _submit(),
                    ),
                    const SizedBox(height: 24),
                    EcoButton(
                      label: 'Sign in',
                      busy: auth.busy,
                      busyLabel: 'Signing in…',
                      onPressed: _submit,
                    ),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: <Widget>[
                        const Text(
                          "Don't have an account?",
                          style: TextStyle(
                            color: EcoColors.muted,
                            fontSize: 14,
                          ),
                        ),
                        TextButton(
                          onPressed: auth.busy ? null : _goToRegister,
                          child: const Text(
                            'Create one',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 76,
      height: 76,
      decoration: BoxDecoration(
        color: EcoColors.accentSoft,
        borderRadius: BorderRadius.circular(24),
      ),
      child: const Icon(Icons.eco_rounded, size: 40, color: EcoColors.accent),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFBE9E7),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFF5C6C2)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Icon(Icons.error_outline_rounded,
              size: 20, color: EcoColors.dump),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: EcoColors.dump,
                fontSize: 14,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
