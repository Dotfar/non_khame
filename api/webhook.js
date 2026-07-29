import axios from "axios";

const TOKEN = "8478636545:AAF7OPGuMiK4xN1FWjhRkcxIinFbUGY3s-s"; // توکن ربات خودت را اینجا بگذار
const API = `https://api.telegram.org/bot${TOKEN}`;

// حافظه موقت برای نگهداری آلبوم‌ها و نام فایل‌ها
const albums = {};
const userState = {};

async function sendMessage(chatId, text) {
    await axios.post(`${API}/sendMessage`, { chat_id: chatId, text: text });
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
            await sendMessage(chatId, "سلام! 🧁\n\nعکس‌هات رو به صورت تکی یا آلبوم (گروهی) بفرست تا پس از دریافت، نام دلخواه فایل PDF رو ازت بپرسم.");
            return res.status(200).json({ ok: true });
        }

        // ۲. اگر کاربر در انتظار وارد کردن نام فایل PDF است
        if (userState[chatId] && userState[chatId].step === "WAITING_FOR_NAME") {
            const fileName = text.replace(/[/\\?%*:|"<>]/g, "_"); // پاک کردن کاراکترهای غیرمجاز برای نام فایل
            const photoUrls = userState[chatId].photos;
            
            await sendMessage(chatId, `⏳ در حال ساخت فایل PDF با نام "${fileName}.pdf"...`);

            // ساخت یک سند PDF ساده با تصاویر به صورت بیسیک و استاندارد
            const pdfBuffer = await createSimplePdf(photoUrls);

            // ارسال فایل PDF به کاربر
            const formData = new (await import('form-data')).default();
            formData.append('chat_id', chatId);
            formData.append('document', pdfBuffer, {
                filename: `${fileName}.pdf`,
                contentType: 'application/pdf',
            });
            formData.append('caption', `فایل PDF شما با نام ${fileName} آماده شد 🧁`);

            await axios.post(`${API}/sendDocument`, formData, {
                headers: formData.getHeaders(),
            });

            // پاک کردن استیت کاربر
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
                // اگر عکس‌ها به صورت آلبوم (گروهی) ارسال شوند
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
                            await sendMessage(chatId, `📁 آلبوم عکس دریافت شد (${currentAlbum.photos.length} عکس).\n\nلطفاً **نام دلخواه** فایل PDF خود را ارسال کنید:`);
                        }, 2000) // مکث ۲ ثانیه برای دریافت کامل همه عکس‌های آلبوم
                    };
                }
                albums[mediaGroupId].photos.push(fileUrl);
            } else {
                // اگر عکس به صورت تکی ارسال شود
                userState[chatId] = {
                    step: "WAITING_FOR_NAME",
                    photos: [fileUrl]
                };
                await sendMessage(chatId, "📷 عکس دریافت شد.\n\nلطفاً **نام دلخواه** فایل PDF خود را ارسال کنید:");
            }

            return res.status(200).json({ ok: true });
        }

        return res.status(200).json({ ok: true });

    } catch (err) {
        console.error("Error:", err.message);
        return res.status(200).json({ ok: true });
    }
}

// تابع سبک و استاندارد برای چسباندن عکس‌ها داخل ساختار PDF بدون خطای پکیج‌های سنگین
async function createSimplePdf(photoUrls) {
    // از آنجا که محیط سرورلس باید بدون باگ و فوق‌العاده سبک باشد، 
    // تصاویر را با ساختار استانداردِ ایمن هندل می‌کنیم.
    const PDFDocument = (await import('pdfkit')).default;
    
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
        let buffers = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            resolve(Buffer.concat(buffers));
        });

        (async () => {
            try {
                for (const url of photoUrls) {
                    const imgRes = await axios.get(url, { responseType: 'arraybuffer' });
                    const imgBuffer = Buffer.from(imgRes.data);

                    doc.addPage({ size: 'A4', margin: 0 });
                    // قراردادن تصویر در صفحه با ابعاد متناسب
                    doc.image(imgBuffer, 0, 0, {
                        fit: [595.28, 841.89], // ابعاد استاندارد صفحه A4
                        align: 'center',
                        valign: 'center'
                    });
                }
                doc.end();
            } catch (e) {
                reject(e);
            }
        })();
    });
}

