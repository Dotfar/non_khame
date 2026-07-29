const BOT_TOKEN = "8478636545:AAHBAhgq0CmhJk8xkOdrd9bkal9okN2pT0k";
const ADMIN_ID = 1010974042;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId, text, replyMarkup = null) {
  const body = {
    chat_id: chatId,
    text: text,
  };
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export default async function handler(req, res) {
  // تست سلامت سرور در مرورگر
  if (req.method !== "POST") {
    return res.status(200).send("ربات نون‌خامه‌ای روشن و آماده‌ست! 🧁");
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    if (body && body.message) {
      const msg = body.message;
      const chatId = msg.chat.id;
      const text = msg.text ? msg.text.trim() : "";

      if (text === "/start") {
        const welcomeText = 
          "سلام من نون‌خامه‌ای‌ام! 🧁\n\n" +
          "من می‌تونم این کارها رو برات انجام بدم:\n" +
          "• 📷 اگه عکس بفرستی، برات PDF می‌سازم.\n" +
          "• 📄 اگه PDF بفرستی، عکس‌هاش رو جدا می‌کنم.\n" +
          "• 🎤 اگه ویس بفرستی، برات به متن تبدیل می‌کنم.\n" +
          "• ✍️ اگه متن بفرستی، برات به ویس تبدیل می‌کنم.\n" +
          "• 🆔 با دستور /id هم آیدی عددی‌ت رو میگم.";
        
        const keyboard = {
          keyboard: [[{ text: "🧷 ساخت PDF" }]],
          resize_keyboard: true,
        };

        await sendMessage(chatId, welcomeText, keyboard);
      } else if (text === "/id") {
        await sendMessage(chatId, `🆔 آیدی عددی شما: ${chatId}`);
      } else if (text === "🧷 ساخت PDF") {
        await sendMessage(chatId, "عکس‌های مورد نظرت رو بفرست، وقتی تموم شد اسم فایل رو برام بفرست 🧁");
      } else if (msg.photo) {
        await sendMessage(chatId, "✅ عکس ذخیره شد.\nمی‌تونی ادامه بدی یا «🧷 ساخت PDF» رو بزنی.");
      } else if (text) {
        await sendMessage(chatId, "دستور رو متوجه نشدم! برای شروع /start رو بزن 🧁");
      }
    }
  } catch (error) {
    console.error("Error processing update:", error);
  }

  return res.status(200).json({ ok: true });
}
