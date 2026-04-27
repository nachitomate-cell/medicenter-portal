/**
 * Email service con Resend.
 * https://resend.com — 3.000 emails/mes gratis, API simple.
 *
 * Para reemplazar por SendGrid/Mailgun: solo cambiar sendInvitationEmail.
 */

interface SendInvitationParams {
  to: string;
  displayName: string;
  role: string;
  setupLink: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  doctor: "Médico",
  secretary: "Secretaría",
};

export async function sendInvitationEmail({
  to,
  displayName,
  role,
  setupLink,
}: SendInvitationParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    throw new Error("RESEND_API_KEY o RESEND_FROM_EMAIL no configurados");
  }

  const roleLabel = ROLE_LABELS[role] ?? role;

  // HTML mínimo, alineado con la estética Stark.
  // Email-safe: tablas, inline styles, sin CSS moderno.
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invitación a Medicenter</title>
</head>
<body style="margin:0;padding:0;background:#000000;font-family:Georgia,'Times New Roman',serif;color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#000000;">
    <tr>
      <td align="center" style="padding:48px 24px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #ffffff;">
          <tr>
            <td style="padding:32px 32px 16px 32px;border-bottom:1px solid #ffffff;">
              <p style="margin:0;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#999999;">
                Medicenter · Invitación
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 32px;">
              <h1 style="margin:0 0 24px 0;font-family:Georgia,serif;font-size:32px;font-weight:400;line-height:1.15;color:#ffffff;">
                Hola ${escapeHtml(displayName)},
              </h1>
              <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#ffffff;">
                Has sido invitado/a al portal Medicenter como
                <strong style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;border:1px solid #ffffff;padding:2px 8px;margin:0 4px;">
                  ${escapeHtml(roleLabel)}
                </strong>.
              </p>
              <p style="margin:0 0 32px 0;font-size:14px;line-height:1.6;color:#ffffff;">
                Para activar tu cuenta y definir tu contraseña, haz click en el siguiente enlace:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#ffffff;">
                    <a href="${setupLink}" style="display:inline-block;padding:14px 32px;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#000000;text-decoration:none;">
                      Activar cuenta →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:32px 0 0 0;font-family:'Courier New',monospace;font-size:11px;line-height:1.6;color:#999999;">
                Este enlace expira en 1 hora. Si no esperabas esta invitación, ignora este email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #ffffff;">
              <p style="margin:0;font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#666666;">
                Medicenter · v0.1
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject: `Invitación a Medicenter — Activa tu cuenta`,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errorText}`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
