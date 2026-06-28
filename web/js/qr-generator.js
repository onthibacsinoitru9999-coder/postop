/**
 * QRGenerator - QR code generation and patient data encoding/decoding
 * Uses LZString for compression and qrcode-generator for QR rendering
 */
const QRGenerator = {
  /** @type {string|null} Last generated URL */
  _lastUrl: null,

  /** @type {Object|null} Last generated QR code object */
  _lastQR: null,

  /**
   * Encode patient data object to a compressed URI-safe string
   * @param {Object} patientData - Patient data with compact keys
   * @returns {string} Compressed encoded string
   */
  encode(patientData) {
    const json = JSON.stringify(patientData);
    if (typeof LZString === 'undefined') {
      console.error('LZString library not loaded');
      throw new Error('Thư viện nén dữ liệu chưa được tải');
    }
    return LZString.compressToEncodedURIComponent(json);
  },

  /**
   * Decode a compressed string back to patient data object
   * @param {string} compressed - Compressed encoded string
   * @returns {Object} Decoded patient data
   */
  decode(compressed) {
    if (typeof LZString === 'undefined') {
      throw new Error('Thư viện nén dữ liệu chưa được tải');
    }
    const json = LZString.decompressFromEncodedURIComponent(compressed);
    if (!json) {
      throw new Error('Không thể giải nén dữ liệu');
    }
    return JSON.parse(json);
  },

  /**
   * Generate a QR code and render it as SVG into a container element
   * @param {string} containerId - ID of the DOM element to render into
   * @param {Object} patientData - Patient data to encode
   * @returns {string} The full URL encoded in the QR code
   */
  generate(containerId, patientData) {
    const encoded = this.encode(patientData);
    const baseUrl = App.getBaseUrl();
    const url = `${baseUrl}/patient.html?d=${encoded}`;

    if (typeof qrcode === 'undefined') {
      throw new Error('Thư viện QR code chưa được tải');
    }

    // typeNumber 0 = auto-detect size based on data length
    // Error correction level 'M' = ~15% recovery
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();

    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Không tìm thấy phần tử #${containerId}`);
    }

    // Render as SVG for crisp display at any size
    container.innerHTML = qr.createSvgTag({
      cellSize: 6,
      margin: 4,
      scalable: true,
    });

    // Style the SVG for responsive display
    const svg = container.querySelector('svg');
    if (svg) {
      svg.style.width = '100%';
      svg.style.height = 'auto';
      svg.style.maxWidth = '320px';
      svg.style.display = 'block';
      svg.style.margin = '0 auto';
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'Mã QR hướng dẫn chăm sóc sau phẫu thuật');
    }

    // Store references for later use
    this._lastUrl = url;
    this._lastQR = qr;

    return url;
  },

  /**
   * Download the last generated QR code as a PNG file
   * @param {string} filename - Download filename
   * @param {number} size - Image size in pixels
   */
  downloadPNG(filename = 'postop-qr.png', size = 400) {
    const svgEl = document.querySelector('#qr-canvas svg');
    if (!svgEl) {
      App.showToast('Chưa có mã QR để tải xuống', 'error');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const svgBlob = new Blob([svgStr], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const blobUrl = URL.createObjectURL(svgBlob);

    img.onload = () => {
      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      // Draw QR code
      ctx.drawImage(img, 0, 0, size, size);

      // Trigger download
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      App.showToast('Đã tải mã QR thành công!', 'success');
    };

    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      App.showToast('Lỗi khi tạo ảnh PNG', 'error');
    };

    img.src = blobUrl;
  },

  /**
   * Get the last generated URL
   * @returns {string|null}
   */
  getLastUrl() {
    return this._lastUrl;
  },

  /**
   * Copy the last generated URL to clipboard
   */
  async copyUrl() {
    const url = this.getLastUrl();
    if (!url) {
      App.showToast('Chưa có URL để sao chép', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      App.showToast('Đã sao chép link!', 'success');
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      App.showToast('Đã sao chép link!', 'success');
    }
  },

  /**
   * Parse URL parameters on the patient page and return decoded patient data
   * @returns {Object|null} Decoded patient data or null if invalid/missing
   */
  getPatientDataFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const compressed = params.get('d');

    if (!compressed) {
      console.warn('No patient data parameter found in URL');
      return null;
    }

    try {
      const data = this.decode(compressed);

      // Basic validation
      if (!data || typeof data !== 'object') {
        console.error('Decoded data is not an object');
        return null;
      }

      // Ensure required fields exist
      if (!data.p) {
        console.error('Missing procedure ID in patient data');
        return null;
      }

      return data;
    } catch (error) {
      console.error('Failed to decode patient data:', error);
      return null;
    }
  },

  /**
   * Estimate the QR code version needed for the data
   * @param {Object} patientData - Patient data to check
   * @returns {{ encoded: string, urlLength: number, estimatedVersion: number }}
   */
  estimateSize(patientData) {
    const encoded = this.encode(patientData);
    const baseUrl = App.getBaseUrl();
    const url = `${baseUrl}/patient.html?d=${encoded}`;
    const len = url.length;

    // QR version thresholds (alphanumeric mode, error correction M)
    let version = 5;
    if (len > 2331) version = 20;
    else if (len > 1708) version = 15;
    else if (len > 1146) version = 12;
    else if (len > 652) version = 10;
    else if (len > 367) version = 7;

    return {
      encoded,
      urlLength: len,
      estimatedVersion: version,
    };
  },
};
