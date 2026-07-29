import axios from "axios";

// ==============================
// Bot Token
// ==============================

const TOKEN = "8478636545:AAHBAhgq0CmhJk8xkOdrd9bkal9okN2pT0k";

const API = `https://api.telegram.org/bot${TOKEN}`;

async function sendMessage(chatId, text, extra = {}) {
    return axios.post(`${API}/sendMessage`, {
        chat_id: chatId,
        text,
        ...extra
    });
}

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(200).send("Telegram Bot is Running");
    }

    try {

        const update = req.body;

        if (!update.message)
            return res.status(200).json({ ok: true });

        const msg = update.message;

        const chatId = msg.chat.id;

        const text = (msg.text || "").trim();

        //==========================
        // /start
        //==========================

        if (text === "/start") {

            await sendMessage(
                chatId,
                `سلام 👋

به ربات خوش اومدی.

دستورات:

/start
/id
/echo متن

یا از دکمه‌های پایین استفاده کن.`,
                {
                    reply_markup: {
                        keyboard: [
                            ["/id"],
                            ["/echo سلام"]
                        ],
                        resize_keyboard: true
                    }
                }
            );

            return res.status(200).json({ ok: true });
        }

        //==========================
        // /id
        //==========================

        if (text === "/id") {

            await sendMessage(
                chatId,
                `🆔 آیدی عددی شما:

${msg.from.id}`
            );

            return res.status(200).json({ ok: true });
        }

        //==========================
        // /echo
        //==========================

        if (text.startsWith("/echo")) {

            const value = text.replace("/echo", "").trim();

            await sendMessage(
                chatId,
                value.length ? value : "متنی وارد نشده است."
            );

            return res.status(200).json({ ok: true });
        }

        //==========================
        // Text Messages
        //==========================

        if (text.length > 0) {

            await sendMessage(
                chatId,
                `پیام شما:

${text}`
            );

            return res.status(200).json({ ok: true });
        }

        //==========================
        // Light Files
        //==========================

        if (msg.document || msg.photo) {

            await sendMessage(
                chatId,
                "✅ فایل دریافت شد."
            );

            return res.status(200).json({ ok: true });
        }

        return res.status(200).json({ ok: true });

    } catch (err) {

        console.error(err.response?.data || err.message);

        return res.status(200).json({
            ok: true
        });

    }

}
