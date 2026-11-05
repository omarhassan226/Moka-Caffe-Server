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
2. استخرج قائمة الأصناف المشتراة من كافة الصفحات بدقة.
3. تفصيل الصفحات: حدد المجموع الفرعي لكل صفحة في pageBreakdown.
4. احتسب المجاميع الحسابية الإجمالية بدقة متناهية:
   - المبلغ الإجمالي قبل الضريبة (subtotal)
   - قيمة الضريبة المضافة وضريبة الجدول إن وجدت (taxAmount)
   - الإجمالي النهائي الشامل المطلوب سداده لكافة الصفحات (amount: Grand Total)`
      : "";

    const systemPrompt = `
أنت مدقق حسابات وخبير محاسبي عالي الدقة في قراءة وتحليل فواتير وإيصالات الكافيهات والمطاعم في مصر.
مهمتك استخراج وتدقيق البيانات بدقة حسابية متناهية (100% Accurate OCR):${multiPageInstruction}

قواعد التدقيق الحسابي الإلزامية:
1. دقة الأرقام والكسور العشرية: انتبه بدقة شديدة للفاصلة العشرية والكسور (مثال: 8,364.75 أو 9,034.09 أو 125.50). لا تتجاهل القروش أو الفواصل.
2. التفريق الدقيق بين المبالغ:
   - subtotal: المجموع قبل الضريبة (صافي قيمة البضاعة/الأصناف بدون ضرائب).
   - taxAmount: إجمالي قيمة الضرائب (ضريبة القيمة المضافة 14% + ضريبة الجدول 5% إن وجدت).
   - amount: الإجمالي النهائي الشامل لكافة الضرائب والخدمة والمطلوب دفعه (Grand Total).
3. استخراج تفاصيل الأصناف (items):
   - اسم الصنف، الكمية، سعر الوحدة، الإجمالي (الكمية × السعر = الإجمالي).
4. تفصيل الصفحات (pageBreakdown):
   - رقم كل صفحة والمجموع الخاص بها.
5. تاريخ الفاتورة ورقمها: استخرج التاريخ الفعلي المطبوع على الفاتورة (YYYY-MM-DD) ورقم الإيصال/الفاتورة.
6. التصنيف: اختر واحداً فقط من: ["خامات وبن", "ألبان وسيرب", "حلويات ومخبوزات", "تعبئة وتغليف", "نظافة ومستهلكات", "صيانة وتشغيل", "أخرى"].

أجب بصيغة JSON حصراً بدون أي نصوص أو markdown codeblocks إضافية:
{
  "supplier": "اسم المورد أو الشركة أو المحل",
  "subtotal": 0.00,
  "taxAmount": 0.00,
  "amount": 0.00,
  "invoiceDate": "YYYY-MM-DD",
  "invoiceNumber": "رقم الفاتورة أو الإيصال إن وجد",
  "category": "خامات وبن",
  "items": [
    { "name": "اسم الصنف", "quantity": 1, "price": 0.00, "total": 0.00 }
  ],
  "pageBreakdown": [
    { "page": 1, "total": 0.00, "note": "تفاصيل صفحة 1" }
  ],
  "notes": "ملخص التدقيق الحسابي وتأكيد مطابقة إجمالي الأصناف مع الفاتورة"
}
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

    // Prioritized models: gemini-3.1-flash-lite and gemini-flash-lite-latest have active quota & instant response
    const models = [
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.6-flash",
      "gemini-3.7-flash",
      "gemini-3.8-flash"
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
            subtotal: parseFloat(parsed.subtotal) || 0,
            taxAmount: parseFloat(parsed.taxAmount) || 0,
            amount: parseFloat(parsed.amount) || 0,
            invoiceDate: parsed.invoiceDate || new Date().toISOString().split("T")[0],
            invoiceNumber: parsed.invoiceNumber || "",
            category: parsed.category || "خامات وبن",
            items: parsed.items || [],
            pageBreakdown: parsed.pageBreakdown || [],
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
