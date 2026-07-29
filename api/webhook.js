import axios from "axios";

const TOKEN = "8478636545:AAF7OPGuMiK4xN1FWjhRkcxIinFbUGY3s-s"; // توکن خودت رو اینجا بذار
const API = `https://api.telegram.org/bot${TOKEN}`;

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(200).send("Bot is alive!");
    }

    try {
        const update = req.body;
        if (!update.message) {
            return res.status(200).json({ ok: true });
        }

        const msg = update.message;
        const chatId = msg.chat.id;
        const text = (msg.text || "").trim();

        if (text === "/start") {
            await axios.post(`${API}/sendMessage`, {
                chat_id: chatId,
                text: "سلام! ربات نون‌خامه‌ای با موفقیت متصل شد و داره کار می‌کنه 🧁"
            });
        } else if (msg.photo) {
            await axios.post(`${API}/sendMessage`, {
                chat_id: chatId,
                text: "✅ عکس شما دریافت شد!"
            });
        }

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(200).json({ ok: true });
    }
}
