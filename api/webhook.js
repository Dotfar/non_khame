import axios from "axios";
import PDFDocument from "pdfkit";
import FormData from "form-data";

const TOKEN = "8478636545:AAF7OPGuMiK4xN1FWjhRkcxIinFbUGY3s-s";
const API = `https://api.telegram.org/bot${TOKEN}`;

const userState = {};

async function telegram(method, data = {}) {
    const response = await axios.post(
        `${API}/${method}`,
        data,
        { timeout: 30000 }
    );

    if (!response.data.ok) {
        throw new Error(
            response.data.description || "Telegram API Error"
        );
    }

    return response.data;
}

async function sendMessage(chatId, text) {
    await telegram("sendMessage", {
        chat_id: chatId,
        text
    });
}

async function sendAction(chatId, action) {
    try {
        await telegram("sendChatAction", {
            chat_id: chatId,
            action
        });
    } catch (error) {
        console.error("ACTION ERROR:", error.message);
    }
}

async function getFileUrl(fileId) {
    const result = await telegram("getFile", {
        file_id: fileId
    });

    const filePath = result.result.file_path;

    return `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
}

async function downloadImage(fileId) {
    const url = await getFileUrl(fileId);

    const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 60000
    });

    return Buffer.from(response.data);
}

async function createPdf(fileIds) {
    return new Promise(async (resolve, reject) => {
        try {
            const doc = new PDFDocument({
                autoFirstPage: false,
                margin: 0
            });

            const chunks = [];

            doc.on("data", chunk => {
                chunks.push(chunk);
            });

            doc.on("end", () => {
                resolve(Buffer.concat(chunks));
            });

            doc.on("error", reject);

            for (const fileId of fileIds) {
                const imageBuffer = await downloadImage(fileId);

                doc.addPage({
                    size: "A4",
                    margin: 0
                });

                doc.image(imageBuffer, 15, 15, {
                    fit: [565, 812],
                    align: "center",
                    valign: "center"
                });
            }

            doc.end();

        } catch (error) {
            reject(error);
        }
    });
}

async function sendPdf(chatId, pdfBuffer, fileName) {
    const form = new FormData();

    form.append("chat_id", String(chatId));

    form.append("document", pdfBuffer, {
        filename: `${fileName}.pdf`,
        contentType: "application/pdf"
    });

    await axios.post(
        `${API}/sendDocument`,
        form,
        {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 120000
        }
    );
}

function cleanFileName(name) {
    let result = String(name || "")
        .trim()
        .replace(/[\/\\?%*:|"<>]/g, "_")
        .replace(/\s+/g, " ");

    if (!result) {
        result = "document";
    }

    return result.substring(0, 100);
}

async function askForName(chatId) {
    const count = userState[chatId]?.photos?.length || 0;

    await sendMessage(
        chatId,
        `📸 ${count} عکس دریافت شد!

اگه عکس دیگه‌ای هم داری، همینجا بفرست 👇🏻

وقتی کارت تموم شد، فقط **اسم فایل PDF** رو بفرست.

مثلاً:
درس ریاضی
یا
عکس‌های سفر 🌱`
    );
}

async function handlePhoto(msg, chatId) {
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;

    // اگر قبلاً عکس فرستاده و منتظر اسم هستیم،
    // عکس جدید را هم به همان PDF اضافه کن
    if (
        userState[chatId] &&
        userState[chatId].step === "WAITING_FOR_NAME"
    ) {
        userState[chatId].photos.push(fileId);

        await sendMessage(
            chatId,
            `📸 عکس جدید اضافه شد!
الان ${userState[chatId].photos.length} عکس برای PDF داری.

اگر عکس دیگه‌ای نداری، اسم فایل رو بفرست ✍🏻`
        );

        return;
    }

    // اولین عکس
    userState[chatId] = {
        step: "WAITING_FOR_NAME",
        photos: [fileId]
    };

    await askForName(chatId);
}

async function handleName(chatId, text) {
    const state = userState[chatId];

    if (!state || state.step !== "WAITING_FOR_NAME") {
        return;
    }

    if (!text) {
        await sendMessage(
            chatId,
            "✍🏻 اول اسم فایل PDF رو به صورت متنی بفرست."
        );
        return;
    }

    const fileName = cleanFileName(text);
    const photos = [...state.photos];

    await sendMessage(
        chatId,
        `⏳ دارم PDF رو می‌سازم...

📄 اسم فایل:
${fileName}.pdf

📸 تعداد صفحات: ${photos.length}`
    );

    await sendAction(chatId, "upload_document");

    try {
        const pdfBuffer = await createPdf(photos);

        await sendPdf(
            chatId,
            pdfBuffer,
            fileName
        );

        await sendMessage(
            chatId,
            `✅ آماده شد! 🧁

📄 ${fileName}.pdf

هر وقت خواستی، عکس‌های بعدی رو هم بفرست.`
        );

    } catch (error) {
        console.error(
            "PDF ERROR:",
            error.stack || error.message
        );

        await sendMessage(
            chatId,
            "❌ یه مشکلی موقع ساخت PDF پیش اومد 😐\n\nدوباره عکس‌ها رو بفرست."
        );
    }

    delete userState[chatId];
}

export default async function handler(req, res) {
    try {
        // تست Vercel
        if (req.method === "GET") {
            return res.status(200).send(
                "🧁 نون خامه ای فعاله!"
            );
        }

        if (req.method !== "POST") {
            return res.status(405).json({
                ok: false
            });
        }

        const update = req.body;

        if (!update || !update.message) {
            return res.status(200).json({
                ok: true
            });
        }

        const msg = update.message;
        const chatId = msg.chat?.id;

        if (!chatId) {
            return res.status(200).json({
                ok: true
            });
        }

        const text =
            typeof msg.text === "string"
                ? msg.text.trim()
                : "";

        // شروع
        if (text === "/start") {
            delete userState[chatId];

            await sendMessage(
                chatId,
                `سلاممم 👋🏻🧁

من «نون خامه ای» هستم؛
عکس‌هات رو می‌گیریم و تبدیلشون می‌کنیم به یه PDF مرتب و آماده 😎

📸 عکس‌هات رو بفرست؛
تکی یا چندتا پشت سر هم.

بعدش فقط اسم فایل رو بهم بگو.

مثلاً:
«جزوه فیزیک»
«مدارک»
«عکس‌های سفر»

و من تحویلت میدم:
📄 جزوه فیزیک.pdf

بزن بریم 😌👇🏻`
            );

            return res.status(200).json({
                ok: true
            });
        }

        // اگر عکس است
        if (msg.photo) {
            await handlePhoto(msg, chatId);

            return res.status(200).json({
                ok: true
            });
        }

        // اگر در انتظار اسم هستیم
        if (
            userState[chatId] &&
            userState[chatId].step === "WAITING_FOR_NAME"
        ) {
            await handleName(chatId, text);

            return res.status(200).json({
                ok: true
            });
        }

        // پیام عادی
        await sendMessage(
            chatId,
            `🧁 من آماده‌ام!

چندتا عکس بفرست تا برات PDF بسازم 📸📄`
        );

        return res.status(200).json({
            ok: true
        });

    } catch (error) {
        console.error(
            "HANDLER ERROR:",
            error.stack || error.message
        );

        return res.status(200).json({
            ok: true
        });
    }
}
