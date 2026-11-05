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
2. لكل صنف في الفاتورة: حدد رقم الصفحة التي ورد فيها بدقة (page: 1, 2, 3...) واسمه والكمية وسعر الوحدة والضريبة والإجمالي.
3. في أسفل الفاتورة بالصفحة الأخيرة يوجد ملخص الضرائب الرسمي المطبوع (Taxes Summary): اقرأ منه الضرائب المطبوعة فقط بدقة تامة وبدون أي افتراضات مسبقة!`
      : `\nتنبيه: اقرأ تفاصيل الأصناف وملخص الضرائب المطبوع في أسفل الفاتورة بدقة تامة ومن الورقة حصراً.`;

    const systemPrompt = `
أنت مدقق حسابات وخبير ضرائب مصري عالي الدقة في قراءة وتحليل فواتير وإيصالات الكافيهات والمطاعم في مصر.
مهمتك استخراج وتدقيق البيانات بدقة حسابية متناهية (100% Accurate OCR):${multiPageInstruction}

قواعد التدقيق الحسابي الإلزامية:
1. دقة الأرقام والكسور العشرية: انتبه بدقة شديدة لكل الأرقام والكسور العشرية (مثال: 55.75، 62.35، 8364.75، 9034.09). لا تقرب أو تحذف القروش نهائياً!
2. استخراج قائمة الأصناف (items):
   - لكل صنف استخرج بدقة من أعمدة الفاتورة:
     * "page": رقم الصفحة المأخوذ منها الصنف (1، 2، 3...)
     * "name": اسم الصنف كما هو مكتوب
     * "quantity": الكمية كرقم دقيق
     * "unitPrice": سعر الوحدة الصافي بالكسور العشرية كرقم
     * "taxType": نوع ونسبة الضريبة المطبوعة في عمود Taxes نصاً كما هي (مثال: "SCHD 5%" أو "VAT 14%" أو "0%"). إذا لم توجد ضريبة اكتب "".
     * "totalPrice": إجمالي الصنف قبل الضريبة المطبوع في عمود Amount (أو حاصل ضرب الكمية في سعر الوحدة).
     * "taxIncluded": إجمالي الصنف شامل الضريبة المطبوع في عمود Tax Incl. (المبلغ بعد إضافة الضريبة).
3. استخراج الضرائب المطبوعة في ذيل الفاتورة (Taxes Breakdown) من الورقة حصراً - ممنوع الديفولت:
   - اقرأ بدقة جدول الضرائب المطبوع في أسفل الفاتورة بالصفحة الأخيرة:
     * ضريبة القيمة المضافة 14% (vat14): استخرج القيمة المطبوعة صراحة فقط لـ VAT 14% (مثال: VAT 14% on 3,183.00 LE: 445.62 LE -> 445.62). إذا لم تكن هناك ضريبة 14% مطبوعة على الفاتورة، ضع vat14: 0.00 فوراً (إياك وافتراض أو تخمين أي ضريبة 14% لم تُطبع في الفاتورة).
     * ضريبة الجدول 5% (schedule5): استخرج القيمة المطبوعة صراحة فقط لـ Schedule Tax 5% (مثال: Schedule Tax 5% on 5,813.16 LE: 290.66 LE -> 290.66). إذا لم تُطبع، ضع schedule5: 0.00 فوراً.
     * untaxedSubtotal: المجموع الصافي المطبوع في Untaxed Amount قبل الضرائب.
     * grandTotal: الإجمالي النهائي الشامل المطبوع في Total المطلوب سداده.
     * taxesSummary: قائمة بجميع الضرائب المطبوعة فعلياً على الفاتورة فقط: [{"name": "ضريبة ق.م 14%", "rate": 14, "amount": 0.00}]. إذا لم تكن هناك ضريبة اترك القائمة فارغة [].
4. تاريخ الفاتورة ورقمها واسم المورد والتصنيف.

أجب بصيغة JSON حصراً بدون أي نصوص أو markdown codeblocks إضافية:
{
  "supplier": "اسم المورد أو الشركة",
  "untaxedSubtotal": 0.00,
  "vat14": 0.00,
  "schedule5": 0.00,
  "hasVat14": false,
  "hasSchedule5": false,
  "taxesSummary": [],
  "grandTotal": 0.00,
  "invoiceDate": "YYYY-MM-DD",
  "invoiceNumber": "",
  "category": "خامات وبن",
  "items": [
    { "page": 1, "name": "اسم الصنف", "quantity": 1, "unitPrice": 0.00, "taxType": "SCHD 5%", "totalPrice": 0.00, "taxIncluded": 0.00 }
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
          const taxType = String(it.taxType || it.taxes || "").trim();
          const tot = Number(it.totalPrice || it.amount || it.total) || (qty * unit);

          // Calculate exact tax rate per item - Never default to 14% or 5% if not indicated
          let rate = 0;
          const upperTax = taxType.toUpperCase();
          const pctMatch = upperTax.match(/(\d+(?:\.\d+)?)\s*%/);
          if (pctMatch) {
            rate = parseFloat(pctMatch[1]) / 100;
          } else if (upperTax.includes("VAT") || upperTax.includes("قيمة مضافة")) {
            rate = 0.14;
          } else if (upperTax.includes("SCHD") || upperTax.includes("جدول")) {
            rate = 0.05;
          }

          let taxIncl = Number(it.taxIncluded || it.taxIncl);
          // If taxIncl is missing or was incorrectly read as equal to untaxed amount while rate > 0
          if (!taxIncl || isNaN(taxIncl) || (rate > 0 && Math.abs(taxIncl - tot) < 0.01)) {
            taxIncl = tot * (1 + rate);
          }

          return {
            page: Number(it.page) || 1,
            name: String(it.name || `صنف ${i + 1}`).trim(),
            quantity: qty,
            unitPrice: parseFloat(unit.toFixed(2)),
            taxType: taxType || (rate === 0.14 ? "VAT 14%" : (rate === 0.05 ? "SCHD 5%" : "0%")),
            totalPrice: parseFloat(tot.toFixed(2)),
            taxIncluded: parseFloat(taxIncl.toFixed(2))
          };
        });

        const itemsSubtotal = items.reduce((s, it) => s + it.totalPrice, 0);
        const itemsTaxInclSum = items.reduce((s, it) => s + it.taxIncluded, 0);

        // Ground truth: When items are extracted, their exact mathematical sum is the true audited invoice total
        const untaxedSubtotal = items.length > 0
          ? parseFloat(itemsSubtotal.toFixed(2))
          : (Number(parsed.untaxedSubtotal || parsed.subtotal) || 0);

        const grandTotal = items.length > 0
          ? parseFloat(itemsTaxInclSum.toFixed(2))
          : (Number(parsed.grandTotal || parsed.amount) || 0);
        
        // Strict dynamic taxes from invoice
        const rawVat14 = Number(parsed.vat14) || 0;
        const rawSchedule5 = Number(parsed.schedule5) || 0;
        const hasVat14 = Boolean(parsed.hasVat14 || rawVat14 > 0);
        const hasSchedule5 = Boolean(parsed.hasSchedule5 || rawSchedule5 > 0);
        let vat14 = hasVat14 ? parseFloat(rawVat14.toFixed(2)) : 0;
        let schedule5 = hasSchedule5 ? parseFloat(rawSchedule5.toFixed(2)) : 0;
        const taxAmount = parseFloat((grandTotal - untaxedSubtotal).toFixed(2));

        // If items-level taxes exist and differ from partial footer, align tax breakdown with items
        if (items.length > 0 && Math.abs((vat14 + schedule5) - taxAmount) > 0.05) {
          let v14 = 0;
          let s5 = 0;
          items.forEach(it => {
            const itemTax = it.taxIncluded - it.totalPrice;
            if (itemTax > 0) {
              const t = String(it.taxType || "").toUpperCase();
              if (t.includes("14") || t.includes("VAT")) v14 += itemTax;
              else if (t.includes("5") || t.includes("SCHD")) s5 += itemTax;
            }
          });
          if (v14 > 0 || s5 > 0) {
            vat14 = parseFloat(v14.toFixed(2));
            schedule5 = parseFloat(s5.toFixed(2));
          }
        }

        // Group items by page for clean breakdown
        const pageGroups = {};
        items.forEach(it => {
          const p = it.page || 1;
          if (!pageGroups[p]) pageGroups[p] = { page: p, subtotal: 0, taxIncluded: 0, itemsCount: 0 };
          pageGroups[p].subtotal += it.totalPrice;
          pageGroups[p].taxIncluded += it.taxIncluded;
          pageGroups[p].itemsCount += 1;
        });

        const pageBreakdown = Object.values(pageGroups).map(g => ({
          page: g.page,
          subtotal: parseFloat(g.subtotal.toFixed(2)),
          taxIncluded: parseFloat(g.taxIncluded.toFixed(2)),
          total: parseFloat(g.taxIncluded.toFixed(2)),
          itemsCount: g.itemsCount,
          note: `صفحة ${g.page}: ${g.itemsCount} صنف (صافي ${g.subtotal.toFixed(2)} | شامل ${g.taxIncluded.toFixed(2)} ج.م)`
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
              vat14: vat14,
              schedule5: schedule5,
              hasVat14: hasVat14 && vat14 > 0,
              hasSchedule5: hasSchedule5 && schedule5 > 0,
              taxesSummary: Array.isArray(parsed.taxesSummary) ? parsed.taxesSummary : []
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
