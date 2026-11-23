import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../config/app_theme.dart';
import '../../providers/auth_provider.dart';
import '../../utils/validators.dart';
import '../../widgets/app_text_field.dart';
import '../../widgets/eco_button.dart';

/// Account creation against `POST /api/auth/signup`.
///
/// On success the root widget already swaps to the authenticated shell, so this
/// route pops back to the first route to reveal it.
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _name = TextEditingController();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();
  final TextEditingController _confirm = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final AuthProvider auth = context.read<AuthProvider>();
    final bool ok = await auth.signUp(
      email: _email.text,
      password: _password.text,
      fullName: _name.text,
    );
    if (!ok || !mounted) return;

    // Reveal the shell that the root widget swapped in beneath us.
    Navigator.of(context).popUntil((Route<dynamic> route) => route.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final AuthProvider auth = context.watch<AuthProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Create account')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  const Text(
                    'Join EcoTrace',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      color: EcoColors.ink,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Report waste, track cleanups and hold authorities to account.',
                    style: TextStyle(color: EcoColors.muted, fontSize: 14.5, height: 1.5),
                  ),
                  const SizedBox(height: 24),
                  if (auth.error != null) ...<Widget>[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFBE9E7),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          const Icon(Icons.error_outline_rounded,
                              size: 20, color: EcoColors.dump),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              auth.error!,
                              style: const TextStyle(
                                color: EcoColors.dump,
                                fontSize: 14,
                                height: 1.4,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                  AppTextField(
                    controller: _name,
                    label: 'Full name (optional)',
                    hint: 'Jane Citizen',
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.next,
                    prefixIcon: Icons.person_outline_rounded,
                    validator: Validators.fullName,
                    onChanged: (_) => auth.clearError(),
                  ),
                  const SizedBox(height: 16),
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
                    hint: 'At least 6 characters',
                    obscureText: _obscure,
                    textInputAction: TextInputAction.next,
                    autofillHints: const <String>[AutofillHints.newPassword],
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
                    onChanged: (_) => auth.clearError(),
                  ),
                  const SizedBox(height: 16),
                  AppTextField(
                    controller: _confirm,
                    label: 'Confirm password',
                    hint: 'Repeat your password',
                    obscureText: _obscure,
                    textInputAction: TextInputAction.done,
                    prefixIcon: Icons.lock_outline_rounded,
                    validator: (String? v) =>
                        Validators.confirmPassword(v, _password.text),
                    onSubmitted: (_) => _submit(),
                  ),
                  const SizedBox(height: 24),
                  EcoButton(
                    label: 'Create account',
                    busy: auth.busy,
                    busyLabel: 'Creating account…',
                    onPressed: _submit,
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: auth.busy ? null : () => Navigator.of(context).pop(),
                    child: const Text('I already have an account'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
