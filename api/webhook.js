import axios from "axios";
import PDFDocument from "pdfkit";
import FormData from "form-data";

const TOKEN = "8478636545:AAF7OPGuMiK4xN1FWjhRkcxIinFbUGY3s-s";
const API = `https://api.telegram.org/bot${TOKEN}`;

const albums = {};
const userState = {};

async function telegram(method, data = {}) {
    const response = await axios.post(`${API}/${method}`, data, {
        timeout: 30000
    });

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
        console.error("sendMessage:", error.message);
    }
}

async function sendAction(chatId, action) {
    try {
        await telegram("sendChatAction", {
            chat_id: chatId,
            action
        });
    } catch (error) {
        console.error("sendAction:", error.message);
    }
}

async function getFileUrl(fileId) {
    const result = await telegram("getFile", {
        file_id: fileId
    });

    const filePath = result.result.file_path;

    if (!filePath) {
        throw new Error("Telegram file path not found");
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

            doc.on("data", (chunk) => {
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

    await axios.post(`${API}/sendDocument`, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 120000
    });
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

async function askForFileName(chatId, fileIds) {
    if (!fileIds || fileIds.length === 0) {
        await sendMessage(
            chatId,
            "❌ هیچ عکسی دریافت نشد. دوباره امتحان کن."
        );
        return;
    }

    userState[chatId] = {
        step: "WAITING_FOR_NAME",
        photos: fileIds
    };

    await sendMessage(
        chatId,
        `✅ ${fileIds.length} عکس دریافت شد.

📄 اسم فایل PDF رو چی بزارم؟`
    );
}

async function handleName(chatId, text) {
    const state = userState[chatId];

    if (!state || state.step !== "WAITING_FOR_NAME") {
        return false;
    }

    const fileName = cleanFileName(text);

    if (!state.photos || state.photos.length === 0) {
        delete userState[chatId];

        await sendMessage(
            chatId,
            "❌ عکس‌ها پیدا نشدن. دوباره عکس بفرست."
        );

        return true;
    }

    await sendMessage(
        chatId,
        `⏳ دارم فایل «${fileName}.pdf» رو می‌سازم...`
    );

    await sendAction(chatId, "upload_document");

    try {
        const pdfBuffer = await createPdf(state.photos);

        await sendPdf(
            chatId,
            pdfBuffer,
            fileName
        );

        await sendMessage(
            chatId,
            "✅ PDF آماده شد 🧁"
        );

    } catch (error) {
        console.error(
            "PDF ERROR:",
            error.stack || error.message
        );

        await sendMessage(
            chatId,
            "❌ هنگام ساخت PDF خطا اتفاق افتاد. دوباره عکس‌ها رو بفرست."
        );
    }

    delete userState[chatId];

    return true;
}

async function handlePhoto(msg, chatId) {
    const bestPhoto =
        msg.photo[msg.photo.length - 1];

    const fileId = bestPhoto.file_id;

    const mediaGroupId =
        msg.media_group_id;

    console.log(
        "PHOTO:",
        fileId,
        "ALBUM:",
        mediaGroupId || "NO"
    );

    if (!mediaGroupId) {
        await askForFileName(
            chatId,
            [fileId]
        );

        return;
    }

    if (!albums[mediaGroupId]) {
        albums[mediaGroupId] = {
            chatId,
            photos: [],
            timer: null
        };
    }

    albums[mediaGroupId].photos.push(fileId);

    if (albums[mediaGroupId].timer) {
        clearTimeout(
            albums[mediaGroupId].timer
        );
    }

    albums[mediaGroupId].timer =
        setTimeout(async () => {
            const album =
                albums[mediaGroupId];

            if (!album) {
                return;
            }

            delete albums[mediaGroupId];

            console.log(
                "ALBUM COMPLETE:",
                album.photos.length
            );

            await askForFileName(
                album.chatId,
                album.photos
            );

        }, 1800);
}

export default async function handler(req, res) {
    try {
        if (req.method === "GET") {
            return res.status(200).send(
                "🧁 PDF Bot is Running"
            );
        }

        if (req.method !== "POST") {
            return res.status(405).json({
                ok: false,
                error: "Method Not Allowed"
            });
        }

        const update = req.body;

        console.log(
            "UPDATE RECEIVED:",
            JSON.stringify(update)
        );

        if (!update || !update.message) {
            return res.status(200).json({
                ok: true
            });
        }

        const msg = update.message;

        const chatId =
            msg.chat && msg.chat.id;

        if (!chatId) {
            return res.status(200).json({
                ok: true
            });
        }

        const text =
            typeof msg.text === "string"
                ? msg.text.trim()
                : "";

        if (text === "/start") {
            delete userState[chatId];

            await sendMessage(
                chatId,
                `سلام 👋🏻

من نون خامه ای هستم 🧁

عکس‌هات رو به صورت تکی یا آلبوم بفرست.

بعد از دریافت عکس‌ها ازت می‌پرسم:

📄 اسم فایل PDF رو چی بزارم؟`
            );

            return res.status(200).json({
                ok: true
            });
        }

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

        if (msg.photo) {
            await handlePhoto(
                msg,
                chatId
            );

            return res.status(200).json({
                ok: true
            });
        }

        await sendMessage(
            chatId,
            "🧁 برای ساخت PDF عکس بفرست."
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
