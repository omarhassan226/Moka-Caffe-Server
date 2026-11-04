/**
 * Móka Caffe - AI Invoice OCR & Vision Service
 * Uses Google Gemini Vision API to extract structured financial data from receipt photos:
 * - Supplier Name (اسم المورد / المحل)
 * - Total Amount (المبلغ الإجمالي)
 * - Date (تاريخ الفاتورة)
 * - Invoice Number (رقم الفاتورة)
 * - Category (التصنيف المحاسبي للكافيه)
 * - Line items & notes
 */

class AiInvoiceService {
  /**
   * Extract invoice data from base64 image using Gemini Vision
   */
  static async scanInvoice({ imageData, apiKey: customApiKey }) {
    if (!imageData) {
      const error = new Error("لم يتم إرسال صورة الفاتورة");
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

    // Prepare Base64 payload (strip data:image/...;base64, prefix if present)
    let mimeType = "image/jpeg";
    let base64Data = imageData;

    const dataUrlMatch = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1];
      base64Data = dataUrlMatch[2];
    }

    const systemPrompt = `
أنت خبير محاسبي متخصص في قراءة وتحليل فواتير وإيصالات الكافيهات والمطاعم في مصر.
حلل صورة هذه الفاتورة بدقة، واستخرج البيانات التالية بصيغة JSON حصراً بدون أي نصوص إضافية:
{
  "supplier": "اسم المورد أو المحل أو الشركة (مثال: بن النجار، ألبان جهينة، محمصات، سوبر ماركت)",
  "amount": 0.00, // المبلغ الإجمالي النهائي المطلوب دفعه (الصافي أو Total) كقيمة رقمية Number فقط
  "invoiceDate": "YYYY-MM-DD", // تاريخ الفاتورة، إذا كانت السنة غير واضحة اعتمد السنة الحالية
  "invoiceNumber": "", // رقم الفاتورة أو الإيصال إن وجد
  "category": "خامات وبن", // اختر واحداً فقط بدقة من: ["خامات وبن", "ألبان وسيرب", "حلويات ومخبوزات", "تعبئة وتغليف", "نظافة ومستهلكات", "صيانة وتشغيل", "أخرى"]
  "items": [
    { "name": "اسم الصنف", "quantity": 1, "price": 0, "total": 0 }
  ],
  "taxAmount": 0, // قيمة الضريبة إن وجدت
  "notes": "ملخص أهم الأصناف المشتراة أو أي ملاحظة مهمة"
}
تأكد من أن amount هو الرقم النهائي الإجمالي الشامل في الفاتورة.
أجب بصيغة JSON صريحة فقط.
`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
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
          data: {
            supplier: parsed.supplier || "فاتورة مشتريات",
            amount: parseFloat(parsed.amount) || 0,
            invoiceDate: parsed.invoiceDate || new Date().toISOString().split("T")[0],
            invoiceNumber: parsed.invoiceNumber || "",
            category: parsed.category || "خامات وبن",
            items: parsed.items || [],
            taxAmount: parseFloat(parsed.taxAmount) || 0,
            notes: parsed.notes || ""
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

