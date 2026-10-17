const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { BadRequestError, NotFoundError } = require('../../shared/errors');

const privateDirectory = path.resolve(process.cwd(), 'uploads-private', 'kyc');
const allowedTypes = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.pdf', 'application/pdf'],
]);

fs.mkdirSync(privateDirectory, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, privateDirectory),
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${crypto.randomUUID()}${extension}`);
    },
  }),
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.get(extension) !== file.mimetype) {
      return callback(new BadRequestError('Upload a JPG, PNG, WebP, or PDF document'));
    }
    callback(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

function documentKey(filename) {
  return `private://kyc/${filename}`;
}

function resolveDocument(filename) {
  if (typeof filename !== 'string' || !/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|pdf)$/.test(filename)) {
    throw new NotFoundError('KYC document file not found');
  }

  const filePath = path.resolve(privateDirectory, filename);
  if (!filePath.startsWith(`${privateDirectory}${path.sep}`)) {
    throw new NotFoundError('KYC document file not found');
  }
  return filePath;
}

function contentType(filename) {
  const type = allowedTypes.get(path.extname(filename).toLowerCase());
  if (!type) throw new NotFoundError('KYC document file not found');
  return type;
}

async function validateDocument(file) {
  if (!file || !file.path || !allowedTypes.has(path.extname(file.filename || '').toLowerCase())) {
    throw new BadRequestError('A supported KYC document file is required');
  }

  const contents = await fs.promises.readFile(file.path);
  const extension = path.extname(file.filename).toLowerCase();
  const validSignature = extension === '.pdf'
    ? contents.subarray(0, 5).toString() === '%PDF-'
    : extension === '.png'
      ? contents.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : extension === '.webp'
        ? contents.subarray(0, 4).toString() === 'RIFF' && contents.subarray(8, 12).toString() === 'WEBP'
        : contents.subarray(0, 3).equals(Buffer.from([255, 216, 255]));

  if (!validSignature) throw new BadRequestError('The uploaded document content does not match its file type');
}

module.exports = { upload, documentKey, resolveDocument, contentType, validateDocument };
