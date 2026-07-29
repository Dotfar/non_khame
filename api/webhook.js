const BOT_TOKEN = "8478636545:AAHBAhgq0CmhJk8xkOdrd9bkal9okN2pT0k";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// یک حافظه موقت ساده برای نگهداری عکس‌های کاربران در حال حاضر
const userSessions = {};

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

      // ساخت سشن برای کاربر اگر وجود نداشت
      if (!userSessions[chatId]) {
        userSessions[chatId] = { mode: "normal", photos: [] };
      }

      const session = userSessions[chatId];

      if (text === "/start") {
        session.mode = "normal";
        session.photos = [];
        
        const welcomeText = 
          "سلام من نون‌خامه‌ای‌ام! 🧁\n\n" +
          "من می‌تونم این کارها رو برات انجام بدم:\n" +
          "• 📷 اگه عکس بفرستی، برات PDF می‌سازم.\n" +
          "• 📄 اگه PDF بفرستی، عکس‌هاش رو جدا می‌کنم.\n" +
          "• 🆔 با دستور /id هم آیدی عددی‌ت رو میگم.";
        
        const keyboard = {
          keyboard: [
            [{ text: "🧷 ساخت PDF" }],
            [{ text: "❌ لغو عملیات" }]
          ],
          resize_keyboard: true,
        };

        await sendMessage(chatId, welcomeText, keyboard);
      } 
      else if (text === "/id") {
        await sendMessage(chatId, `🆔 آیدی عددی شما: ${chatId}`);
      } 
      else if (text === "🧷 ساخت PDF") {
        if (session.photos.length === 0) {
          await sendMessage(chatId, "⚠️ هنوز هیچ عکسی نفرستادی! اول چندتا عکس بفرست بعد این دکمه رو بزن 🧁");
        } else {
          await sendMessage(chatId, `⏳ عالی! ${session.photos.length} تا عکس دریافت شد. دارم PDF رو آماده می‌کنم...`);
          // اینجا در مراحل بعدی ساخت PDF واقعی رو اضافه می‌کنیم
          session.photos = [];
          session.mode = "normal";
        }
      } 
      else if (text === "❌ لغو عملیات") {
        session.photos = [];
        session.mode = "normal";
        await sendMessage(chatId, "عملکرد پاکسازی شد. هر وقت خواستی دوباره شروع کن! 🧁");
      } 
      else if (msg.photo) {
        // دریافت بزرگترین سایز عکس ارسال شده
        const photoArray = msg.photo;
        const bestPhoto = photoArray[photoArray.length - 1];
        
        session.photos.push(bestPhoto.file_id);
        
        await sendMessage(chatId, `✅ عکس دریافت شد! (تعداد کل عکس‌ها: ${session.photos.length})\nوقتی عکسا تموم شد، روی «🧷 ساخت PDF» بزن.`);
      } 
      else if (text) {
        await sendMessage(chatId, "دستور رو متوجه نشدم! برای شروع /start رو بزن یا عکس بفرست 🧁");
      }
    }
  } catch (error) {
    console.error("Error processing update:", error);
  }

  return res.status(200).json({ ok: true });
}
