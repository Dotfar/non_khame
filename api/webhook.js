import axios from "axios";
import PDFDocument from "pdfkit";
import FormData from "form-data";

// توکن فعلی رباتت رو اینجا قرار بده
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
    try {
        await telegram("sendMessage", {
            chat_id: chatId,
            text
        });
    } catch (error) {
        console.error("SEND MESSAGE ERROR:", error.message);
    }
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

    if (!filePath) {
        throw new Error("File path not found");
    }

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
        `📸 ${count} عکس گرفتم!

هرچی دیگه داری بفرست؛
وقتی تموم شد فقط اسم فایل رو بگو ✏️`
    );
}

async function handlePhoto(msg, chatId) {
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;

    // اگر قبلاً عکس فرستاده
    if (
        userState[chatId] &&
        userState[chatId].step === "WAITING_FOR_NAME"
    ) {
        userState[chatId].photos.push(fileId);

        const count = userState[chatId].photos.length;

        await sendMessage(
            chatId,
            `📸 ${count} عکس شد!

اگه دیگه عکسی نداری، اسم فایل رو بفرست ✏️`
        );

        return;
    }

    // اولین عکس
    userState[chatId] = {
        step: "WAITING_FOR_NAME",
        photos: [fileId]
    };

    await sendMessage(
        chatId,
        `📸 عکس رو گرفتم!

اگه عکس دیگه‌ای داری بفرست؛
وقتی تموم شد اسم فایل رو بگو ✏️`
    );
}

async function handleName(chatId, text) {
    const state = userState[chatId];

    if (
        !state ||
        state.step !== "WAITING_FOR_NAME"
    ) {
        return;
    }

    if (!text) {
        await sendMessage(
            chatId,
            "✏️ اسم فایل رو به صورت متن بفرست."
        );
        return;
    }

    const fileName = cleanFileName(text);
    const photos = [...state.photos];

    await sendMessage(
        chatId,
        `⏳ دارم PDF رو می‌سازم...`
    );

    await sendAction(
        chatId,
        "upload_document"
    );

    try {
        const pdfBuffer = await createPdf(photos);

        await sendPdf(
            chatId,
            pdfBuffer,
            fileName
        );

        await sendMessage(
            chatId,
            `✅ آماده شد 🧁

📄 ${fileName}.pdf`
        );

    } catch (error) {
        console.error(
            "PDF ERROR:",
            error.stack || error.message
        );

        await sendMessage(
            chatId,
            "❌ یه مشکلی پیش اومد 😐\nدوباره امتحان کن."
        );
    }

    delete userState[chatId];
}

export default async function handler(req, res) {
    try {
        // تست Vercel
        if (req.method === "GET") {
            return res.status(200).send(
                "🧁 نون خامه‌ای فعاله!"
            );
        }

        if (req.method !== "POST") {
            return res.status(405).json({
                ok: false
            });
        }

        const update = req.body;

        if (
            !update ||
            !update.message
        ) {
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

        // /start
        if (text === "/start") {
            delete userState[chatId];

            await sendMessage(
                chatId,
                `سلاممم 😌🧁

عکس داری؟
بفرستشون اینجا، من تبدیلشون می‌کنم به PDF 📸➡️📄

هرچندتا عکس خواستی بفرست؛
وقتی تموم شد فقط اسم فایل رو بگو.

بقیه‌ش با من 😎`
            );

            return res.status(200).json({
                ok: true
            });
        }

        // عکس
        if (msg.photo) {
            await handlePhoto(
                msg,
                chatId
            );

            return res.status(200).json({
                ok: true
            });
        }

        // اسم فایل
        if (
            userState[chatId] &&
            userState[chatId].step ===
                "WAITING_FOR_NAME"
        ) {
            await handleName(
                chatId,
                text
            );

            return res.status(200).json({
                ok: true
            });
        }

        // پیام عادی
        await sendMessage(
            chatId,
            "📸 عکس بفرست تا برات PDF کنم 🧁"
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
