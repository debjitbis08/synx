/**
 * MCP demonstration component: a sign-up form with validation.
 *
 * Unlike the linear counter, this graph *branches and re-joins* — two
 * independent inputs each validate, then combine into a single form-validity
 * node — which is what makes the graph / trace / assert tools worth using:
 *
 *     emailInput ──▶ email ──▶ emailValid ──┐
 *                                           ├─▶ formValid ──▶ status
 *     passwordInput ▶ password ▶ passwordValid ┘
 *
 * Every node is labeled and the form is instantiated at the top level, so
 * importing this module populates the @synx/debug registry for `synx_load`.
 * See ./README.md for a full MCP walkthrough.
 */
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { label, labelSource } from "@synx/debug";

export function build(): void {
  // Source events — inject into these from the MCP server.
  const [emailInput, emitEmail] = E.create<string>();
  const [passwordInput, emitPassword] = E.create<string>();

  // Latch each input into a reactive current-value.
  const email = E.stepper(emailInput, "");
  const password = E.stepper(passwordInput, "");

  // Independent validation branches.
  const emailValid = R.map(email, (value) => value.includes("@"));
  const passwordValid = R.map(password, (value) => value.length >= 8);

  // Re-join: the form is valid only when both branches are.
  const formValid = R.ap(
    passwordValid,
    R.map(emailValid, (e) => (p: boolean) => e && p),
  );

  const status = R.map(formValid, (ok) =>
    ok ? "ready to submit" : "fill in the form",
  );

  labelSource("emailInput", emailInput, emitEmail);
  labelSource("passwordInput", passwordInput, emitPassword);
  label("email", email);
  label("password", password);
  label("emailValid", emailValid);
  label("passwordValid", passwordValid);
  label("formValid", formValid);
  label("status", status);
}

// Top-level instantiation so executing the module registers the nodes.
build();
