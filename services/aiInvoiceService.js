/**
 * Móka Caffe - AI Invoice OCR & Vision Service
 * Uses Google Gemini Vision API to extract structured financial data from receipt photos:
 * - Supports Multi-Page Invoices (up to 10+ pages in a single invoice)
 * - Automatically aggregates line items and sums grand total across all pages
 * - Supplier Name (اسم المورد / المحل)
 * - Date & Invoice Number
 * - Category classification
 */

class AiInvoiceService {
  /**
   * Extract invoice data from one or multiple base64 images using Gemini Vision
   */
  static async scanInvoice({ imageData, images, apiKey: customApiKey }) {
    const imagesList = Array.isArray(images) && images.length > 0
      ? images
      : (imageData ? [imageData] : []);

    if (imagesList.length === 0) {
      const error = new Error("لم يتم إرسال أي صورة للفاتورة");
      error.status = 400;
      throw error;
    }

    const apiKey = customApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return {
        success: false,
        requiresKey: true,
        message: "يرجى إدخال مفتاح Gemini API المجاني لتفعيل القراءة بالذكاء الاصطناعي.",
        suggested: {
          supplier: "",
          amount: 0,
          invoiceDate: new Date().toISOString().split("T")[0],
          category: "خامات وبن",
          notes: ""
        }
      };
    }

    // Prepare Base64 payload for all pages
    const imageParts = imagesList.map((imgStr) => {
      let mimeType = "image/jpeg";
      let base64Data = imgStr;

      const dataUrlMatch = imgStr.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUrlMatch) {
        mimeType = dataUrlMatch[1];
        base64Data = dataUrlMatch[2];
      }

      return {
        inlineData: {
          mimeType: mimeType,
          data: base64Data
        }
      };
    });

    const pageCount = imagesList.length;
    const multiPageInstruction = pageCount > 1
      ? `\nتنبيه هام جداً: هذه الفاتورة تتكون من (${pageCount}) صفحات مرفقة بالترتيب كصور متعددة لفاتورة واحدة.
1. راجع جميع الصفحات بالكامل من أول صفحة حتى آخر صفحة.
2. اجمع قائمة الأصناف من كافة الصفحات.
3. احتسب المبلغ الإجمالي النهائي (Total / Grand Total / الصافي الشامل) لكافة الصفحات معاً:
   - إذا كانت الصفحة الأخيرة تحتوي على الإجمالي الكلي النهائي الشامل لكافة الصفحات فاعتمد هذا الإجمالي مباشرة.
   - إذا كانت كل صفحة تحتوي على مجموع فرعي مستقل، قم بجمع المجاميع الفرعية لتصل إلى إجمالي الفاتورة النهائي بدقة حسابية تامة.`
      : "";

    const systemPrompt = `
أنت خبير محاسبي متخصص في قراءة وتحليل فواتير وإيصالات الكافيهات والمطاعم في مصر.
حلل صور هذه الفاتورة بدقة، واستخرج البيانات التالية بصيغة JSON حصراً بدون أي نصوص إضافية:${multiPageInstruction}
{
  "supplier": "اسم المورد أو المحل أو الشركة (مثال: بن النجار، ألبان جهينة، محمصات، سوبر ماركت)",
  "amount": 0.00, // المبلغ الإجمالي النهائي الشامل لكافة الصفحات كقيمة رقمية Number فقط
  "invoiceDate": "YYYY-MM-DD", // تاريخ الفاتورة، إذا كانت السنة غير واضحة اعتمد السنة الحالية
  "invoiceNumber": "", // رقم الفاتورة أو الإيصال إن وجد
  "category": "خامات وبن", // اختر واحداً فقط بدقة من: ["خامات وبن", "ألبان وسيرب", "حلويات ومخبوزات", "تعبئة وتغليف", "نظافة ومستهلكات", "صيانة وتشغيل", "أخرى"]
  "items": [
    { "name": "اسم الصنف", "quantity": 1, "price": 0, "total": 0 }
  ],
  "taxAmount": 0, // قيمة الضريبة إن وجدت
  "notes": "ملخص أهم الأصناف وعدد الصفحات (${pageCount} صفحات)"
}
تأكد من أن amount هو الرقم النهائي الإجمالي الشامل لكافة صفحات الفاتورة.
أجب بصيغة JSON صريحة فقط.
`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            ...imageParts
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };

    // Prioritized models: gemini-3.5-flash has instant 200 response without 503 demand spikes
    const models = [
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.6-flash",
      "gemini-3.7-flash",
      "gemini-3.8-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest"
    ];
    let lastError = null;

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini API (${model}) Error [${response.status}]: ${errText}`);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!candidate) {
          throw new Error("لم يتم استلام نص من نموذج الذكاء الاصطناعي");
        }

        // Clean JSON text if wrapped in markdown code blocks
        let cleanJson = candidate.trim();
        if (cleanJson.startsWith("```json")) {
          cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (cleanJson.startsWith("```")) {
          cleanJson = cleanJson.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }

        const parsed = JSON.parse(cleanJson);

        return {
          success: true,
          modelUsed: model,
          pageCount: pageCount,
          data: {
            supplier: parsed.supplier || "فاتورة مشتريات",
            amount: parseFloat(parsed.amount) || 0,
            invoiceDate: parsed.invoiceDate || new Date().toISOString().split("T")[0],
            invoiceNumber: parsed.invoiceNumber || "",
            category: parsed.category || "خامات وبن",
            items: parsed.items || [],
            taxAmount: parseFloat(parsed.taxAmount) || 0,
            notes: parsed.notes || `فاتورة من ${pageCount} صفحة/صفحات`
          }
        };
      } catch (err) {
        lastError = err;
        console.warn(`Attempt with ${model} failed:`, err.message);
      }
    }

    throw lastError || new Error("فشل فحص الفاتورة بالذكاء الاصطناعي");
  }
}

module.exports = AiInvoiceService;
