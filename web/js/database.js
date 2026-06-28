/**
 * Database - Fetches and caches JSON data files for PostOp Care
 * All data lives in /data/*.json (procedures.json, instructions.json, medications.json, warnings.json)
 */
const Database = {
  /** @type {Object<string, any>} Internal cache for fetched JSON files */
  _cache: {},

  /**
   * Fetch a JSON file and cache the result
   * @param {string} filename - JSON filename (e.g. 'procedures.json')
   * @returns {Promise<any>} Parsed JSON data
   */
  async fetch(filename) {
    // Return cached version if available
    if (this._cache[filename]) {
      return this._cache[filename];
    }

    try {
      const response = await fetch(`./data/${filename}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Không thể tải ${filename}`);
      }
      const data = await response.json();
      this._cache[filename] = data;
      return data;
    } catch (error) {
      console.error(`Database.fetch error for ${filename}:`, error);
      throw new Error(`Không thể tải dữ liệu: ${filename}. ${error.message}`);
    }
  },

  /**
   * Clear a specific cache entry or the entire cache
   * @param {string} [filename] - If provided, clears only this file from cache
   */
  clearCache(filename) {
    if (filename) {
      delete this._cache[filename];
    } else {
      this._cache = {};
    }
  },

  /**
   * Get all procedures grouped by category
   * @returns {Promise<Array<{category: string, category_name: string, procedures: Array}>>}
   */
  async getProcedures() {
    const data = await this.fetch('procedures.json');
    // Data can be { categories: [...] } or just an array of categories
    return data.categories || data || [];
  },

  /**
   * Get a specific procedure by its ID
   * @param {string} procedureId - Procedure identifier (e.g. 'lap_chole')
   * @returns {Promise<Object|null>} Procedure object or null if not found
   */
  async getProcedure(procedureId) {
    if (!procedureId) return null;

    const categories = await this.getProcedures();

    for (const category of categories) {
      const procedures = category.procedures || [];
      const found = procedures.find((p) => p.id === procedureId);
      if (found) {
        return {
          ...found,
          category: category.category || category.id,
          category_name: category.category_name || category.name || '',
        };
      }
    }

    console.warn(`Procedure not found: ${procedureId}`);
    return null;
  },

  /**
   * Get a flat list of all procedures
   * @returns {Promise<Array>} All procedures without category grouping
   */
  async getAllProceduresFlat() {
    const categories = await this.getProcedures();
    const flat = [];
    for (const category of categories) {
      const procedures = category.procedures || [];
      for (const proc of procedures) {
        flat.push({
          ...proc,
          category: category.category || category.id,
          category_name: category.category_name || category.name || '',
        });
      }
    }
    return flat;
  },

  /**
   * Get instructions for a specific procedure
   * @param {string} procedureId - Procedure identifier
   * @returns {Promise<Object|null>} Instructions object or null
   */
  async getInstructions(procedureId) {
    if (!procedureId) return null;

    try {
      const data = await this.fetch('instructions.json');
      // Data can be { instructions: { procedureId: {...} } } or { procedureId: {...} }
      const instructions = data.instructions || data;

      if (instructions[procedureId]) {
        return instructions[procedureId];
      }

      // Try to find with a default/general fallback
      if (instructions['general'] || instructions['default']) {
        return instructions['general'] || instructions['default'];
      }

      console.warn(`Instructions not found for: ${procedureId}`);
      return null;
    } catch (error) {
      console.error(`Error fetching instructions for ${procedureId}:`, error);
      return null;
    }
  },

  /**
   * Get all medications
   * @returns {Promise<Array>} Array of medication objects
   */
  async getMedications() {
    try {
      const data = await this.fetch('medications.json');
      return data.medications || data || [];
    } catch (error) {
      console.error('Error fetching medications:', error);
      return [];
    }
  },

  /**
   * Get specific medications by their IDs
   * @param {string[]} ids - Array of medication identifiers
   * @returns {Promise<Array>} Matching medication objects
   */
  async getMedicationsByIds(ids) {
    if (!ids || ids.length === 0) return [];

    const allMeds = await this.getMedications();
    const found = [];

    for (const id of ids) {
      const med = allMeds.find((m) => m.id === id);
      if (med) {
        found.push(med);
      } else {
        // Include a placeholder for unknown medications
        console.warn(`Medication not found: ${id}`);
        found.push({
          id: id,
          name: id,
          dosage: 'Theo chỉ định bác sĩ',
          frequency: '',
          notes: '',
          category: 'other',
          _notFound: true,
        });
      }
    }

    return found;
  },

  /**
   * Get warnings (general + procedure-specific), merged and sorted by severity
   * @param {string} procedureId - Procedure identifier
   * @returns {Promise<Array>} Merged warnings array, critical first
   */
  async getWarnings(procedureId) {
    try {
      const data = await this.fetch('warnings.json');
      const warningsData = data.warnings || data;

      let general = [];
      let procedureSpecific = [];

      // Get general warnings
      if (warningsData.general) {
        general = Array.isArray(warningsData.general)
          ? warningsData.general
          : [];
      }

      // Get procedure-specific warnings
      if (procedureId && warningsData[procedureId]) {
        procedureSpecific = Array.isArray(warningsData[procedureId])
          ? warningsData[procedureId]
          : [];
      }

      // Merge and deduplicate by id
      const merged = [...procedureSpecific, ...general];
      const seen = new Set();
      const unique = merged.filter((w) => {
        const key = w.id || w.title || w.message;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Sort by severity: critical > high > medium > low
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      unique.sort((a, b) => {
        const sa = severityOrder[a.severity] ?? 4;
        const sb = severityOrder[b.severity] ?? 4;
        return sa - sb;
      });

      return unique;
    } catch (error) {
      console.error('Error fetching warnings:', error);
      return [];
    }
  },

  /**
   * Get medication categories for grouping in the admin form
   * @returns {Promise<Array>} Array of category objects with id and name
   */
  async getMedicationCategories() {
    try {
      const data = await this.fetch('medications.json');
      if (data.categories) {
        return data.categories;
      }

      // Infer categories from medications
      const meds = data.medications || data || [];
      const catMap = new Map();
      for (const med of meds) {
        const cat = med.category || 'other';
        if (!catMap.has(cat)) {
          catMap.set(cat, {
            id: cat,
            name: med.category_name || cat,
          });
        }
      }
      return Array.from(catMap.values());
    } catch (error) {
      console.error('Error fetching medication categories:', error);
      return [];
    }
  },
};
