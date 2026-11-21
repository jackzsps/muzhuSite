interface Env {
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  NOTIFY_EMAILS: string; // 逗號分隔，例如 "a@example.com,b@example.com"
}

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
}

const MOBILE_PHONE_REGEX = /^09\d{8}$/;
const LANDLINE_PHONE_REGEX = /^(?:02\d{8}|04\d{7,8}|0[35678]\d{7})$/;
const PHONE_EXT_REGEX = /^\d{1,6}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeDigits(raw: string): string {
  return raw
    .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, '');
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const toStr = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

    const rawPhoneType = toStr(body.phoneType);
    const phoneType = rawPhoneType === '' ? 'mobile' : rawPhoneType;
    if (phoneType !== 'mobile' && phoneType !== 'landline') {
      return new Response(JSON.stringify({ error: '請選擇正確的電話類型' }), {
        status: 400,
        headers,
      });
    }

    const trimmedName = toStr(body.name);
    const trimmedPhone = normalizeDigits(toStr(body.phone));
    const trimmedPhoneExt = phoneType === 'landline' ? normalizeDigits(toStr(body.phoneExt)) : '';
    const trimmedEmail = toStr(body.email);
    const trimmedCity = toStr(body.city);
    const trimmedHouseAge = toStr(body.houseAge);
    const trimmedIndoorPing = toStr(body.indoorPing);
    const trimmedBudget = toStr(body.budget);
    const trimmedMessage = toStr(body.message);
    const turnstileToken = toStr(body.turnstileToken);

    // 必填欄位檢查
    if (
      !trimmedName ||
      !trimmedPhone ||
      !trimmedCity ||
      !trimmedHouseAge ||
      !trimmedIndoorPing ||
      !trimmedBudget
    ) {
      return new Response(JSON.stringify({ error: '請填寫所有必填欄位' }), {
        status: 400,
        headers,
      });
    }

    // 電話與分機格式檢查
    if (phoneType === 'mobile' && !MOBILE_PHONE_REGEX.test(trimmedPhone)) {
      return new Response(JSON.stringify({ error: '請輸入 09 開頭的 10 位手機號碼' }), {
        status: 400,
        headers,
      });
    }

    if (phoneType === 'landline' && !LANDLINE_PHONE_REGEX.test(trimmedPhone)) {
      return new Response(
        JSON.stringify({ error: '請輸入正確市話號碼（含區碼，例如雙北 0225418826、桃竹 035123456）' }),
        {
          status: 400,
          headers,
        }
      );
    }

    if (phoneType === 'landline' && trimmedPhoneExt && !PHONE_EXT_REGEX.test(trimmedPhoneExt)) {
      return new Response(JSON.stringify({ error: '分機請輸入 1 至 6 位數字' }), {
        status: 400,
        headers,
      });
    }

    // Email 格式檢查（選填，有填時驗證）
    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      return new Response(JSON.stringify({ error: '請輸入正確的電子信箱格式' }), {
        status: 400,
        headers,
      });
    }

    // Turnstile 後端驗證
    const turnstileVerify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: turnstileToken,
        remoteip: request.headers.get('CF-Connecting-IP'),
      }),
    });

    const turnstileResult = await turnstileVerify.json() as TurnstileResponse;
    if (!turnstileResult.success) {
      return new Response(JSON.stringify({ error: '機器人驗證失敗，請重試' }), {
        status: 403,
        headers,
      });
    }

    // 收件人清單
    const recipients = env.NOTIFY_EMAILS
      ? env.NOTIFY_EMAILS.split(',').map((e) => e.trim())
      : ['muzu.jim@muzutw.com'];

    const safeSubjectName = trimmedName.replace(/[\r\n]+/g, ' ');
    const safeSubjectCity = trimmedCity.replace(/[\r\n]+/g, ' ');
    const formattedPhone = trimmedPhoneExt
      ? `${escapeHtml(trimmedPhone)} #${escapeHtml(trimmedPhoneExt)}`
      : escapeHtml(trimmedPhone);

    // 用 Resend 寄信
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: '沐築系統家居 <noreply@muzu.com.tw>',
        to: recipients,
        ...(trimmedEmail ? { reply_to: trimmedEmail } : {}),
        subject: `【網站詢價】${safeSubjectName} - ${safeSubjectCity}`,
        html: `
          <h2>網站聯絡表單通知</h2>
          <table style="border-collapse:collapse;width:100%;max-width:600px;">
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">姓名</td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(trimmedName)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">電話</td><td style="padding:8px;border:1px solid #ddd;">${formattedPhone}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">電子信箱</td><td style="padding:8px;border:1px solid #ddd;">${trimmedEmail ? escapeHtml(trimmedEmail) : '（未填寫）'}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">案場縣市</td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(trimmedCity)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">屋齡</td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(trimmedHouseAge)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">室內坪數</td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(trimmedIndoorPing)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">裝修預算</td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(trimmedBudget)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">需求說明</td><td style="padding:8px;border:1px solid #ddd;">${trimmedMessage ? escapeHtml(trimmedMessage).replace(/\r?\n/g, '<br>') : '（未填寫）'}</td></tr>
          </table>
          <p style="color:#999;font-size:12px;margin-top:16px;">此信件由沐築系統家居網站自動發送</p>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error('Resend API error:', errorData);
      return new Response(JSON.stringify({ error: '郵件發送失敗，請稍後再試' }), {
        status: 500,
        headers,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Contact API error:', error);
    return new Response(JSON.stringify({ error: '伺服器錯誤，請稍後再試' }), {
      status: 500,
      headers,
    });
  }
};
