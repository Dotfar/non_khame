import axios from "axios";

const TOKEN = "8478636545:AAF7OPGuMiK4xN1FWjhRkcxIinFbUGY3s-s"; // توکن ربات شما
const API = `https://api.telegram.org/bot${TOKEN}`;

const albums = {};
const userState = {};

async function sendMessage(chatId, text) {
    try {
        await axios.post(`${API}/sendMessage`, { chat_id: chatId, text: text });
    } catch (err) {
        console.error("SendMessage Error:", err.message);
    }
}

// تابع برای نمایش وضعیت "در حال ارسال فایل..." زیر اسم ربات
async function sendAction(chatId, action) {
    try {
        await axios.post(`${API}/sendChatAction`, { chat_id: chatId, action: action });
    } catch (err) {
        console.error("Action Error:", err.message);
    }
}

async function getFileUrl(fileId) {
    const res = await axios.get(`${API}/getFile?file_id=${fileId}`);
    const filePath = res.data.result.file_path;
    return `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(200).send("PDF Bot is Running 🧁");
    }

    try {
        const update = req.body;
        if (!update.message) {
            return res.status(200).json({ ok: true });
        }

        const msg = update.message;
        const chatId = msg.chat.id;
        const text = (msg.text || "").trim();

        // ۱. دستور شروع
        if (text === "/start") {
            delete userState[chatId];
            delete albums[chatId];
            await sendMessage(chatId, "سلام! 🧁\n\nعکس‌هات رو به صورت تکی یا آلبوم بفرست تا پس از دریافت، نام دلخواه فایل PDF رو ازت بپرسم.");
            return res.status(200).json({ ok: true });
        }

        // ۲. اگر کاربر در انتظار وارد کردن نام فایل است
        if (userState[chatId] && userState[chatId].step === "WAITING_FOR_NAME") {
            const fileName = text.replace(/[/\\?%*:|"<>]/g, "_") || "document";
            const photoUrls = userState[chatId].photos;
            
            // فعال کردن وضعیت uploading زیر اسم ربات (بدون فرستادن پیام متنی)
            await sendAction(chatId, "upload_document");

            try {
                const pdfBuffer = await createSafePdf(photoUrls);

                const formData = new (await import('form-data')).default();
                formData.append('chat_id', chatId);
                formData.append('document', pdfBuffer, {
                    filename: `${fileName}.pdf`,
                    contentType: 'application/pdf',
                });

                await axios.post(`${API}/sendDocument`, formData, {
                    headers: formData.getHeaders(),
                });
            } catch (pdfErr) {
                console.error("PDF Error:", pdfErr.message);
                await sendMessage(chatId, "❌ خطا در ساخت PDF. لطفاً دوباره تلاش کنید.");
            }

            delete userState[chatId];
            return res.status(200).json({ ok: true });
        }

        // ۳. دریافت عکس یا آلبوم عکس
        if (msg.photo) {
            const photoArray = msg.photo;
            const bestPhoto = photoArray[photoArray.length - 1];
            const fileUrl = await getFileUrl(bestPhoto.file_id);
            const mediaGroupId = msg.media_group_id;

            if (mediaGroupId) {
                if (!albums[mediaGroupId]) {
                    albums[mediaGroupId] = {
                        chatId: chatId,
                        photos: [],
                        timer: setTimeout(async () => {
                            const currentAlbum = albums[mediaGroupId];
                            delete albums[mediaGroupId];
                            
                            userState[chatId] = {
                                step: "WAITING_FOR_NAME",
                                photos: currentAlbum.photos
                            };
                            // درخواست اسم بدون هیچ دکمه‌ای
                            await sendMessage(chatId, "اسم انتخاب کن برای فایل:");
                        }, 2500)
                    };
                }
                albums[mediaGroupId].photos.push(fileUrl);
            } else {
                userState[chatId] = {
                    step: "WAITING_FOR_NAME",
                    photos: [fileUrl]
                };
                // درخواست اسم بدون هیچ دکمه‌ای
                await sendMessage(chatId, "اسم انتخاب کن برای فایل:");
            }

            return res.status(200).json({ ok: true });
        }

        return res.status(200).json({ ok: true });

    } catch (err) {
        console.error("Handler Error:", err.message);
        return res.status(200).json({ ok: true });
    }
}

async function createSafePdf(photoUrls) {
    const PDFDocument = (await import('pdfkit')).default;
    return new Promise(async (resolve, reject) => {
        try {
            const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
            let buffers = [];

            doc.on('data', chunk => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', err => reject(err));

            for (const url of photoUrls) {
                const imgRes = await axios.get(url, { responseType: 'arraybuffer' });
                const imgBuffer = Buffer.from(imgRes.data);

                doc.addPage({ size: 'A4', margin: 15 });
                doc.image(imgBuffer, 15, 15, {
                    fit: [565, 812],
                    align: 'center',
                    valign: 'center'
                });
            }
            doc.end();
        } catch (e) {
            reject(e);
        }
    });
}
