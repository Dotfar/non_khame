export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("نون‌خامه‌ای روشن و آماده‌ست! 🧁");
  }

  const token = process.env.8478636545:AAHBAhgq0CmhJk8xkOdrd9bkal9okN2pT0k;
  if (!token) {
    return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN not set" });
  }

  const update = req.body;

  try {
    if (update && update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const text = msg.text ? msg.text.trim() : "";

      if (text === "/start") {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "سلام من نون‌خامه‌ای‌ام! 🧁\n\nبه ربات من خوش اومدی. به زودی قابلیت‌های جدید اضافه میشه!"
          })
        });
      }
    }
  } catch (err) {
    console.error("Error:", err);
  }

  return res.status(200).json({ ok: true });
}
