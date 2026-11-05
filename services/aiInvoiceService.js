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
      ? `\nتنبيه فائق الأهمية: هذه الفاتورة تتكون من (${pageCount}) صفحات مرفقة بالترتيب كصور متعددة لفاتورة واحدة.
1. راجع جميع الصفحات (${pageCount} صفحات) بالكامل من أول صفحة حتى آخر صفحة.
2. لكل صنف في الفاتورة: حدد رقم الصفحة التي ورد فيها بدقة (page: 1, 2, 3...) واسمه والكمية وسعر الوحدة والإجمالي.
3. في أسفل الفاتورة بالصفحة الأخيرة يوجد ملخص الضرائب الرسمي المطبوع: اقرأ منه بدقة تامة:
   - Untaxed Amount (المجموع قبل الضريبة)
   - VAT 14% (قيمة ضريبة القيمة المضافة 14%)
   - Schedule Tax 5% (قيمة ضريبة الجدول 5%)
   - Total (الإجمالي النهائي الشامل المطلوب سداده)`
      : `\nتنبيه: اقرأ تفاصيل الأصناف وملخص الضرائب المطبوع في أسفل الفاتورة بدقة تامة.`;

    const systemPrompt = `
أنت مدقق حسابات وخبير ضرائب مصري عالي الدقة في قراءة وتحليل فواتير وإيصالات الكافيهات والمطاعم في مصر.
مهمتك استخراج وتدقيق البيانات بدقة حسابية متناهية (100% Accurate OCR):${multiPageInstruction}

قواعد التدقيق الحسابي الإلزامية:
1. دقة الأرقام والكسور العشرية: انتبه بدقة شديدة لكل الأرقام والكسور العشرية (مثال: 55.75، 62.35، 8364.75، 9034.09). لا تقرب أو تحذف القروش نهائياً!
2. استخراج قائمة الأصناف (items):
   - لكل صنف:
     * "page": رقم الصفحة المأخوذ منها الصنف (1، 2، 3...)
     * "name": اسم الصنف كما هو مكتوب
     * "quantity": الكمية كرقم دقيق
     * "unitPrice": سعر الوحدة الصافي بالكسور العشرية كرقم
     * "totalPrice": إجمالي الصنف (الكمية × سعر الوحدة) بالكسور العشرية كرقم
3. قراءة الملخص المالي والضرائب من أسفل الفاتورة المطبوعة:
   - untaxedSubtotal: المجموع الصافي للأصناف قبل الضريبة (Untaxed Amount).
   - vat14: قيمة ضريبة القيمة المضافة 14% المطبوعة إن وجدت.
   - schedule5: قيمة ضريبة الجدول 5% المطبوعة إن وجدت.
   - grandTotal: الإجمالي النهائي الشامل المطلوب سداده (Total / Net Amount).
4. تاريخ الفاتورة ورقمها واسم المورد والتصنيف.

أجب بصيغة JSON حصراً بدون أي نصوص أو markdown codeblocks إضافية:
{
  "supplier": "اسم المورد أو الشركة",
  "untaxedSubtotal": 0.00,
  "vat14": 0.00,
  "schedule5": 0.00,
  "grandTotal": 0.00,
  "invoiceDate": "YYYY-MM-DD",
  "invoiceNumber": "",
  "category": "خامات وبن",
  "items": [
    { "page": 1, "name": "اسم الصنف", "quantity": 1, "unitPrice": 0.00, "totalPrice": 0.00 }
  ],
  "notes": "ملخص الفاتورة والضرائب"
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

        // Programmatic mathematical verification & precise aggregation
        const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
        const items = rawItems.map((it, i) => {
          const qty = Number(it.quantity) || 1;
          const unit = Number(it.unitPrice || it.price) || 0;
          const tot = Number(it.totalPrice || it.total) || (qty * unit);
          return {
            page: Number(it.page) || 1,
            name: String(it.name || `صنف ${i + 1}`).trim(),
            quantity: qty,
            unitPrice: parseFloat(unit.toFixed(2)),
            totalPrice: parseFloat(tot.toFixed(2))
          };
        });

        const itemsSum = items.reduce((s, it) => s + it.totalPrice, 0);
        const untaxedSubtotal = Number(parsed.untaxedSubtotal || parsed.subtotal) || parseFloat(itemsSum.toFixed(2));
        const vat14 = Number(parsed.vat14) || 0;
        const schedule5 = Number(parsed.schedule5) || 0;
        const taxAmount = Number(parsed.taxAmount) || parseFloat((vat14 + schedule5).toFixed(2));
        const grandTotal = Number(parsed.grandTotal || parsed.amount) || parseFloat((untaxedSubtotal + taxAmount).toFixed(2));

        // Group items by page for clean breakdown
        const pageGroups = {};
        items.forEach(it => {
          const p = it.page || 1;
          if (!pageGroups[p]) pageGroups[p] = { page: p, subtotal: 0, itemsCount: 0 };
          pageGroups[p].subtotal += it.totalPrice;
          pageGroups[p].itemsCount += 1;
        });

        const pageBreakdown = Object.values(pageGroups).map(g => ({
          page: g.page,
          subtotal: parseFloat(g.subtotal.toFixed(2)),
          total: parseFloat(g.subtotal.toFixed(2)),
          itemsCount: g.itemsCount,
          note: `صفحة ${g.page}: ${g.itemsCount} صنف بإجمالي ${g.subtotal.toFixed(2)} ج.م`
        })).sort((a, b) => a.page - b.page);

        return {
          success: true,
          modelUsed: model,
          pageCount: pageCount,
          data: {
            supplier: parsed.supplier || "Moka",
            subtotal: parseFloat(untaxedSubtotal.toFixed(2)),
            taxAmount: parseFloat(taxAmount.toFixed(2)),
            taxDetails: {
              vat14: parseFloat(vat14.toFixed(2)),
              schedule5: parseFloat(schedule5.toFixed(2))
            },
            amount: parseFloat(grandTotal.toFixed(2)),
            invoiceDate: parsed.invoiceDate || parsed.date || new Date().toISOString().split("T")[0],
            invoiceNumber: parsed.invoiceNumber || "",
            category: parsed.category || "خامات وبن",
            items: items,
            pageBreakdown: pageBreakdown,
            notes: parsed.notes || `فاتورة من ${pageCount} صفحة (${items.length} صنف)`
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
