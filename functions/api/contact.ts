interface Env {
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  NOTIFY_EMAILS: string; // 逗號分隔，例如 "a@example.com,b@example.com"
}

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const body = await request.json() as Record<string, string>;
    const { name, phone, city, houseAge, indoorPing, budget, message, turnstileToken } = body;

    // 必填欄位檢查
    if (!name || !phone || !city || !houseAge || !indoorPing || !budget) {
      return new Response(JSON.stringify({ error: '請填寫所有必填欄位' }), {
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
        subject: `【網站詢價】${name} - ${city}`,
        html: `
          <h2>網站聯絡表單通知</h2>
          <table style="border-collapse:collapse;width:100%;max-width:600px;">
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">姓名</td><td style="padding:8px;border:1px solid #ddd;">${name}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">電話</td><td style="padding:8px;border:1px solid #ddd;">${phone}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">案場縣市</td><td style="padding:8px;border:1px solid #ddd;">${city}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">屋齡</td><td style="padding:8px;border:1px solid #ddd;">${houseAge}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">室內坪數</td><td style="padding:8px;border:1px solid #ddd;">${indoorPing}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">裝修預算</td><td style="padding:8px;border:1px solid #ddd;">${budget}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">需求說明</td><td style="padding:8px;border:1px solid #ddd;">${message || '（未填寫）'}</td></tr>
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
