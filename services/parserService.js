/**
 * Smart Arabic Order & Item Parser - Enterprise Server Service
 * Intelligently recognizes quantities at beginning or end of line,
 * normalizes Arabic text, matches against catalog aliases,
 * splits branches/sections, and identifies missing items.
 */

class ParserService {
  constructor(catalog = []) {
    this.catalog = catalog;
  }

  setCatalog(catalog) {
    this.catalog = catalog || [];
  }

  /**
   * Normalize Arabic text for reliable matching
   */
  normalizeText(text) {
    if (!text) return "";
    return text
      .trim()
      // Convert Arabic digits to Western digits
      .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      // Normalize Alef forms
      .replace(/[أإآ]/g, "ا")
      // Normalize Teh Marbuta to Heh
      .replace(/ة/g, "ه")
      // Normalize Alef Maksura to Yeh
      .replace(/ى/g, "ي")
      // Remove Tatweel / Kashida
      .replace(/ـ+/g, "")
      // Remove Harakat / Tashkeel
      .replace(/[\u064B-\u065F\u0670]/g, "")
      // Normalize spacing and lowercase English letters
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  /**
   * Find matching catalog item using exact, alias, and fuzzy matching
   */
  findItem(cleanQuery) {
    if (!cleanQuery) return null;
    const query = this.normalizeText(cleanQuery);

    // 1. Direct match on code
    const byCode = this.catalog.find(it => it.code === query || String(it._id || it.id) === query);
    if (byCode) return byCode;

    // 2. Direct match on Arabic or English Name
    const byName = this.catalog.find(it => {
      const normAr = this.normalizeText(it.nameAr);
      const normEn = this.normalizeText(it.nameEn);
      return normAr === query || normEn === query;
    });
    if (byName) return byName;

    // 3. Match on aliases
    for (const item of this.catalog) {
      if (item.aliases && item.aliases.length > 0) {
        for (const alias of item.aliases) {
          const normAlias = this.normalizeText(alias);
          if (normAlias === query) {
            return item;
          }
        }
      }
    }

    // 4. Substring / Token Inclusion Match
    let bestMatch = null;
    let maxMatchLen = 0;

    for (const item of this.catalog) {
      const searchPool = [
        item.nameAr,
        item.nameEn,
        ...(item.aliases || [])
      ];

      for (const candidate of searchPool) {
        const normCand = this.normalizeText(candidate);
        if (!normCand) continue;

        if (query.includes(normCand) || normCand.includes(query)) {
          const commonLength = Math.min(query.length, normCand.length);
          if (commonLength > maxMatchLen) {
            maxMatchLen = commonLength;
            bestMatch = item;
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Parse a single line to extract item description and quantity
   */
  parseLine(line) {
    const raw = (line || "").trim();
    if (!raw) return null;

    // Normalize Hindi digits to Western digits
    const westernDigits = raw.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));

    let quantity = 1;
    let itemName = raw;

    // Regex 1: Quantity at the start of the line (e.g. "2 شوكلت كوكيز" or "10 كرواسون")
    const leadingMatch = westernDigits.match(/^([0-9]+(?:\.[0-9]+)?)\s*[-x*:]?\s*(.+)$/i);
    // Regex 2: Quantity at the end of the line (e.g. "بنانا بودينج 12" or "كوكيز لافا 3")
    const trailingMatch = westernDigits.match(/^(.+?)\s*[-x*:]?\s*([0-9]+(?:\.[0-9]+)?)$/i);

    if (leadingMatch) {
      quantity = parseFloat(leadingMatch[1]);
      itemName = leadingMatch[2].trim();
    } else if (trailingMatch) {
      quantity = parseFloat(trailingMatch[2]);
      itemName = trailingMatch[1].trim();
    }

    // Clean common prefixes and suffixes
    itemName = itemName
      .replace(/^(عدد|قطع|قطعة|ساندوتش|سندوتش|طلب|بند)\s+/i, "")
      .replace(/\s+(قطعة|قطع|علبة|باكت|units?|pcs?)$/i, "")
      .trim();

    if (!itemName) return null;

    const matched = this.findItem(itemName);

    return {
      rawLine: raw,
      parsedName: itemName,
      quantity: isNaN(quantity) || quantity <= 0 ? 1 : quantity,
      matchedItem: matched || null,
      isMissing: !matched
    };
  }

  /**
   * Parse entire orders text into structured branch sections
   */
  parseOrdersText(rawText) {
    if (!rawText) return [];

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const sections = [];
    let currentSection = {
      name: "الطلبية العامة",
      items: []
    };

    const isSectionHeader = (line) => {
      const lower = line.toLowerCase();
      if (lower.startsWith("west") || lower.includes("فرع ويست")) return "West (ويست)";
      if (lower.includes("تجمع") || lower.includes("tagamoa")) return "حاجه التجمع (Daily Dose)";
      if (lower.includes("زمالك") || lower.includes("zamalek")) return "الزمالك (Zamalek)";
      if (lower.startsWith("فرع ") || lower.startsWith("طلبية ")) return line;
      if (line.endsWith(":") || line.startsWith("#")) return line.replace(/[:#]/g, "").trim();
      return null;
    };

    for (const line of lines) {
      const headerTitle = isSectionHeader(line);
      if (headerTitle) {
        if (currentSection.items.length > 0) {
          sections.push(currentSection);
        }
        currentSection = {
          name: headerTitle,
          items: []
        };
        continue;
      }

      const parsed = this.parseLine(line);
      if (parsed) {
        currentSection.items.push(parsed);
      }
    }

    if (currentSection.items.length > 0) {
      sections.push(currentSection);
    }

    return sections;
  }
}

module.exports = ParserService;
