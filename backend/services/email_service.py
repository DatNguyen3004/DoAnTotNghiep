import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS

def send_reset_email(to_email: str, reset_link: str, username: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "NuLabel - Đặt lại mật khẩu"
    msg["From"] = f"NuLabel <{SMTP_USER}>"
    msg["To"] = to_email

    html = f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#F8FAFC;border-radius:12px">
        <div style="text-align:center;margin-bottom:24px">
            <h1 style="color:#2563EB;font-size:24px;margin:0">NuLabel</h1>
        </div>
        <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #E2E8F0">
            <h2 style="color:#1E293B;font-size:18px;margin-top:0">Đặt lại mật khẩu</h2>
            <p style="color:#475569;font-size:14px">Xin chào <strong>{username}</strong>,</p>
            <p style="color:#475569;font-size:14px">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Nhấn vào nút bên dưới để tiếp tục:</p>
            <div style="text-align:center;margin:28px 0">
                <a href="{reset_link}" style="background:#2563EB;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:700;display:inline-block">
                    Đặt lại mật khẩu
                </a>
            </div>
            <p style="color:#94A3B8;font-size:12px">Link này có hiệu lực trong <strong>30 phút</strong>. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>
        </div>
        <p style="color:#CBD5E1;font-size:11px;text-align:center;margin-top:16px">© 2025 NuLabel. All rights reserved.</p>
    </div>
    """

    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_USER, to_email, msg.as_string())
