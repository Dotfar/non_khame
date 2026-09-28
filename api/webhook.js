import axios from "axios";
import PDFDocument from "pdfkit";
import FormData from "form-data";

// ================================
// CONFIG
// ================================

const TOKEN = 8478636545:AAF7OPGuMiK4xN1FWjhRkcxIinFbUGY3s-s;

if (!TOKEN) {
    console.error("❌ BOT_TOKEN is not set");
}

const API = `https://api.telegram.org/bot${TOKEN}`;

// حافظه موقت
// توجه: برای Vercel دائمی نیست
const albums = globalThis.__albums || (globalThis.__albums = {});
const userState = globalThis.__userState || (globalThis.__userState = {});


// ================================
// TELEGRAM HELPERS
// ================================

async function telegram(method, data = {}) {
    try {
        const response = await axios.post(
            `${API}/${method}`,
            data,
            {
                timeout: 30000
            }
        );

        if (!response.data.ok) {
            console.error(
                `❌ Telegram ${method} Error:`,
                response.data
            );

            throw new Error(
                response.data.description || "Telegram API Error"
            );
        }

        return response.data;

    } catch (error) {

        console.error(
            `❌ Telegram ${method} Exception:`,
            error.response?.data || error.message
        );

        throw error;
    }
}


// ================================
// SEND MESSAGE
// ================================

async function sendMessage(chatId, text) {

    return telegram("sendMessage", {
        chat_id: chatId,
        text
    });
}


// ================================
// CHAT ACTION
// ================================

async function sendAction(chatId, action) {

    try {

        await telegram("sendChatAction", {
            chat_id: chatId,
            action
        });

    } catch (error) {

        console.error(
            "⚠️ Chat Action Error:",
            error.message
        );

    }
}


// ================================
// GET TELEGRAM FILE URL
// ================================

async function getFileUrl(fileId) {

    const result = await telegram("getFile", {
        file_id: fileId
    });

    const filePath = result.result.file_path;

    if (!filePath) {
        throw new Error("Telegram file_path not found");
    }

    return `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
}


// ================================
// DOWNLOAD IMAGE
// ================================

async function downloadImage(fileId) {

    const fileUrl = await getFileUrl(fileId);

    const response = await axios.get(
        fileUrl,
        {
            responseType: "arraybuffer",
            timeout: 60000
        }
    );

    return Buffer.from(response.data);
}


// ================================
// CREATE PDF
// ================================

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

                const pdf = Buffer.concat(chunks);

                resolve(pdf);
            });

            doc.on("error", reject);


            // ----------------------------
            // DOWNLOAD & ADD IMAGES
            // ----------------------------

            for (const fileId of fileIds) {

                console.log(
                    "⬇️ Downloading file:",
                    fileId
                );

                const imageBuffer =
                    await downloadImage(fileId);


                // A4
                const pageWidth = 595.28;
                const pageHeight = 841.89;

                const margin = 15;

                doc.addPage({
                    size: "A4",
                    margin: 0
                });

                doc.image(
                    imageBuffer,
                    margin,
                    margin,
                    {
                        fit: [
                            pageWidth - margin * 2,
                            pageHeight - margin * 2
                        ],
                        align: "center",
                        valign: "center"
                    }
                );
            }

            doc.end();

        } catch (error) {

            reject(error);
        }
    });
}


// ================================
// SEND PDF
// ================================

async function sendPdf(
    chatId,
    pdfBuffer,
    fileName
) {

    const form = new FormData();

    form.append(
        "chat_id",
        String(chatId)
    );

    form.append(
        "document",
        pdfBuffer,
        {
            filename: `${fileName}.pdf`,
            contentType: "application/pdf"
        }
    );

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


// ================================
// CLEAN FILE NAME
// ================================

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


// ================================
// START COMMAND
// ================================

async function handleStart(chatId) {

    delete userState[chatId];

    // حذف آلبوم‌های احتمالی این کاربر
    for (const albumId of Object.keys(albums)) {

        if (albums[albumId]?.chatId === chatId) {

            if (albums[albumId].timer) {
                clearTimeout(
                    albums[albumId].timer
                );
            }

            delete albums[albumId];
        }
    }

    await sendMessage(
        chatId,
        `سلام 👋🏻

من نون خامه ای هستم m🧁

عکس‌هات رو به صورت تکی یا آلبوم بفرست.

بعد از دریافت عکس‌ها ازت می‌پرسم:

📄 اسم فایل PDF رو چی بزارم؟`
    );
}


// ================================
// ASK FILE NAME
// ================================

async function askForFileName(
    chatId,
    photos
) {

    if (!photos || photos.length === 0) {

        console.error(
            "❌ No photos found for:",
            chatId
        );

        await sendMessage(
            chatId,
            "❌ عکس‌ها دریافت نشدن. دوباره امتحان کن."
        );

        return;
    }


    userState[chatId] = {

        step: "WAITING_FOR_NAME",

        photos,

        createdAt: Date.now()
    };


    console.log(
        `✅ ${photos.length} photo(s) ready for PDF`
    );


    await sendMessage(
        chatId,
        `✅ ${photos.length} عکس دریافت شد.

📄 اسم فایل PDF رو چی بزارم؟`
    );
}


// ================================
// HANDLE FILE NAME
// ================================

async function handleFileName(
    chatId,
    text
) {

    const state = userState[chatId];

    if (!state) {
        return false;
    }

    if (
        state.step !==
        "WAITING_FOR_NAME"
    ) {
        return false;
    }


    const fileName =
        cleanFileName(text);


    if (!state.photos?.length) {

        delete userState[chatId];

        await sendMessage(
            chatId,
            "❌ عکس‌ها پیدا نشدن. لطفاً دوباره عکس بفرست."
        );

        return true;
    }


    await sendMessage(
        chatId,
        `⏳ در حال ساخت فایل PDF با نام «${fileName}.pdf»...`
    );


    await sendAction(
        chatId,
        "upload_document"
    );


    try {

        console.log(
            `📄 Creating PDF for ${chatId}`
        );

        const pdf =
            await createPdf(
                state.photos
            );


        console.log(
            `📤 Sending PDF to ${chatId}`
        );


        await sendPdf(
            chatId,
            pdf,
            fileName
        );


        await sendMessage(
            chatId,
            "✅ فایل PDF آماده شد 🧁"
        );


    } catch (error) {

        console.error(
            "❌ PDF ERROR:",
            error.response?.data ||
            error.stack ||
            error.message
        );


        await sendMessage(
            chatId,
            `❌ موقع ساخت PDF خطا پیش اومد.

جزئیات خطا:
${error.message || "Unknown error"}

دوباره عکس‌ها رو بفرست.`
        );

    } finally {

        delete userState[chatId];
    }


    return true;
}


// ================================
// HANDLE PHOTO
// ================================

async function handlePhoto(
    msg,
    chatId
) {

    try {

        const photos =
            msg.photo;

        if (
            !photos ||
            photos.length === 0
        ) {

            await sendMessage(
                chatId,
                "❌ عکس قابل پردازش نیست."
            );

            return;
        }


        // بهترین کیفیت عکس
        const bestPhoto =
            photos[photos.length - 1];


        const fileId =
            bestPhoto.file_id;


        console.log(
            "📸 Photo received:",
            fileId
        );


        // --------------------------------
        // ALBUM
        // --------------------------------

        const mediaGroupId =
            msg.media_group_id;


        if (mediaGroupId) {

            console.log(
                "📚 Album:",
                mediaGroupId
            );


            // اگر آلبوم جدید است
            if (!albums[mediaGroupId]) {

                albums[mediaGroupId] = {

                    chatId,

                    photos: [],

                    timer: null
                };
            }


            // اضافه کردن عکس
            albums[
                mediaGroupId
            ].photos.push(fileId);


            // تایمر قبلی را حذف کن
            if (
                albums[mediaGroupId].timer
            ) {

                clearTimeout(
                    albums[mediaGroupId].timer
                );
            }


            // چون عکس‌های آلبوم پشت سر هم می‌آیند،
            // بعد از 1.5 ثانیه از آخرین عکس
            // آلبوم را کامل فرض می‌کنیم.

            albums[mediaGroupId].timer =
                setTimeout(async () => {

                    try {

                        const album =
                            albums[mediaGroupId];


                        if (!album) {
                            return;
                        }


                        const albumPhotos =
                            [...album.photos];


                        delete albums[
                            mediaGroupId
                        ];


                        console.log(
                            `✅ Album completed: ${albumPhotos.length} photos`
                        );


                        await askForFileName(
                            album.chatId,
                            albumPhotos
                        );


                    } catch (error) {

                        console.error(
                            "❌ Album timer error:",
                            error
                        );
                    }

                }, 1500);


            return;
        }


        // --------------------------------
        // SINGLE PHOTO
        // --------------------------------

        console.log(
            "📸 Single photo"
        );


        await askForFileName(
            chatId,
            [fileId]
        );

    } catch (error) {

        console.error(
            "❌ Photo Handler Error:",
            error.response?.data ||
            error.stack ||
            error.message
        );


        await sendMessage(
            chatId,
            `❌ عکس دریافت شد ولی پردازش نشد.

خطا:
${error.message || "Unknown error"}

لطفاً دوباره امتحان کن.`
        );
    }
}


// ================================
// MAIN WEBHOOK
// ================================

export default async function handler(
    req,
    res
) {

    // --------------------------------
    // HEALTH CHECK
    // --------------------------------

    if (req.method !== "POST") {

        return res
            .status(200)
            .send(
                "🧁 PDF Bot is Running"
            );
    }


    try {

        const update =
            req.body;


        console.log(
            "📩 UPDATE:",
            JSON.stringify(update)
        );


        // --------------------------------
        // فقط message
        // --------------------------------

        if (!update?.message) {

            return res
                .status(200)
                .json({
                    ok: true
                });
        }


        const msg =
            update.message;


        const chatId =
            msg.chat?.id;


        if (!chatId) {

            return res
                .status(200)
                .json({
                    ok: true
                });
        }


        const text =
            (msg.text || "")
                .trim();


        // --------------------------------
        // START
        // --------------------------------

        if (text === "/start") {

            await handleStart(
                chatId
            );

            return res
                .status(200)
                .json({
                    ok: true
                });
        }


        // --------------------------------
        // WAITING FOR FILE NAME
        // --------------------------------

        if (
            userState[chatId]?.step ===
            "WAITING_FOR_NAME"
        ) {

            await handleFileName(
                chatId,
                text
            );

            return res
                .status(200)
                .json({
                    ok: true
                });
        }


        // --------------------------------
        // PHOTO
        // --------------------------------

        if (msg.photo) {

            await handlePhoto(
                msg,
                chatId
            );

            return res
                .status(200)
                .json({
                    ok: true
                });
        }


        // --------------------------------
        // UNKNOWN MESSAGE
        // --------------------------------

        await sendMessage(
            chatId,
            "🧁 برای ساخت PDF عکس بفرست."
        );


        return res
            .status(200)
            .json({
                ok: true
            });


    } catch (error) {

        console.error(
            "🔥 MAIN HANDLER ERROR:",
            error.response?.data ||
            error.stack ||
            error.message
        );


        // همیشه به Telegram پاسخ 200 می‌دهیم
        // تا webhook دوباره بی‌دلیل تکرار نشود.

        return res
            .status(200)
            .json({
                ok: true
            });
    }
                      }
