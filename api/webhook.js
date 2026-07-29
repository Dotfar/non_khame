// ربات تلگرام "نون‌خامه‌ای" - بهینه شده برای Vercel Webhook
const token = process.env.8478636545:AAHBAhgq0CmhJk8xkOdrd9bkal9okN2pT0k;
const ADMIN_ID = 1010974042; // آیدی عددی شما
const BASE = `https://api.telegram.org/bot${token}`;

async function call(method, body) {
  const res = await fetch(`${BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

const sendMessage = (chat_id, text, extra = {}) =>
  call("sendMessage", { chat_id, text, ...extra });

// حافظه موقت برای نگهداری وضعیت کاربران روی سرورلس (برای نسخه پیشرفته‌تر به دیتابیس نیاز است، اما این ساختار اولیه را راه می‌اندازد)
const userState = {};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("نون‌خامه‌ای روشن و آماده‌ست! 🧁");
  }
  if (!token) {
    return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN not set" });
  }

  const update = req.body;
  try {
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const text = msg.text?.trim();

      if (text === "/start") {
        delete userState[chatId];
        await sendMessage(
          chatId,
          "به ربات «نون‌خامه‌ای» خوش اومدی! 🧁\n\n" +
          "• از چند عکس، یک PDF بساز (حداکثر ۵۰ عکس).\n" +
          "• از PDF، تصاویر رو برات درمیارم.\n\n" +
          "عکس یا PDF رو بفرست. برای ساخت PDF هم می‌تونی دکمهٔ «🧷 ساخت PDF» رو بزنی.",
          {
            reply_markup: {
              keyboard: [[{ text: "🧷 ساخت PDF" }]],
              resize_keyboard: true,
            },
          }
        );
      } else if (text === "🧷 ساخت PDF") {
        if (!userState[chatId] || userState[chatId].length === 0) {
          await sendMessage(chatId, "هنوز عکسی نفرستادی عزیز دلم! اول عکس‌هات رو بفرست 🧁");
        } else {
          userState[chatId].step = "waiting_for_name";
          await sendMessage(chatId, "اسم دلخواه برای PDF رو بفرست:");
        }
      } else if (text && userState[chatId]?.step === "waiting_for_name") {
        const fileName = text;
        // اینجا در فازهای بعدی پردازش PDF انجام میشه
        await sendMessage(chatId, `📄 فایل PDF با نام "${fileName}" آماده شد! (به زودی کامل‌تر میشه)`);
        delete userState[chatId];
      } else if (msg.photo) {
        if (!userState[chatId]) userState[chatId] = [];
        userState[chatId].push(msg.photo);
        const count = userState[chatId].length;
        await sendMessage(chatId, `✅ عکس ذخیره شد. (${count} عکس)\nمی‌تونی ادامه بدی یا «🧷 ساخت PDF» رو بزنی.`);
      } else {
        await sendMessage(chatId, "دستور رو متوجه نشدم! برای شروع /start رو بزن 🧁");
      }
    }
  } catch (e) {
    console.error("Handler error:", e);
  }

  res.status(200).json({ ok: true });
}
