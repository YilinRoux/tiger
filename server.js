"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var mongoose_1 = require("mongoose");
var cors_1 = require("cors");
var dotenv_1 = require("dotenv");
var bcryptjs_1 = require("bcryptjs");
var jsonwebtoken_1 = require("jsonwebtoken");
var nodemailer_1 = require("nodemailer");
dotenv_1.default.config();
var app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)());
// Validar variables de entorno
var MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI)
    throw new Error("MONGO_URI no está definido");
var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET)
    throw new Error("JWT_SECRET no está definido");
// Conexión a MongoDB
mongoose_1.default.connect(MONGO_URI)
    .then(function () { return console.log("✅ Conectado a MongoDB Atlas"); })
    .catch(function (err) { return console.error("❌ Error de conexión:", err); });
var emergencyContactSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true, match: /^\+52238[0-9]{7}$/ }, // CORREGIDO: Ahora espera 7 dígitos
    isTutor: { type: Boolean, required: true },
    customMessage: { type: String, required: true, validate: /.*\{ubicación\}.*/ },
    createdAt: { type: Date, default: Date.now }
});
var userSchema = new mongoose_1.default.Schema({
    fullName: { type: String, required: true },
    phone: { type: String, required: true, match: /^\+52238[0-9]{7}$/ }, // CORREGIDO: Ahora espera 7 dígitos
    birthDate: { type: Date },
    location: { type: String, default: "Tehuacán, Puebla" },
    email: { type: String, required: true, unique: true, match: /^a[0-9]{10}@alumno\.uttehuacan\.edu\.mx$/ },
    contraseña: { type: String, required: true, minlength: 8 },
    bloodType: { type: String, required: true, enum: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] },
    alergias: { type: [String], default: [] },
    emergencyContacts: [emergencyContactSchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
var User = mongoose_1.default.model("usuarios", userSchema);
// Configurar nodemailer (para recuperación de contraseña)
var transporter = nodemailer_1.default.createTransport({
    service: 'gmail',
    auth: {
        user: 'tigersos.app@gmail.com', // Reemplaza con un correo real
        pass: process.env.EMAIL_PASSWORD || 'tu_contraseña_segura' // CORREGIDO: Mejor uso de variables de entorno
    }
});
// Almacén temporal para códigos de recuperación
var recoveryTokens = {};
// Ruta de login
app.post("/api/login", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, email, password, user, isMatch, token, error_1;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, email = _a.email, password = _a.password;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 4, , 5]);
                return [4 /*yield*/, User.findOne({ email: email })];
            case 2:
                user = _b.sent();
                if (!user) {
                    res.status(400).json({ message: "Usuario no encontrado" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, bcryptjs_1.default.compare(password, user.contraseña)];
            case 3:
                isMatch = _b.sent();
                if (!isMatch) {
                    res.status(400).json({ message: "Contraseña incorrecta" });
                    return [2 /*return*/];
                }
                token = jsonwebtoken_1.default.sign({ id: user._id }, JWT_SECRET, { expiresIn: "24h" });
                res.json({
                    message: "Inicio de sesión exitoso",
                    token: token,
                    user: {
                        id: user._id,
                        fullName: user.fullName,
                        email: user.email,
                        bloodType: user.bloodType,
                        alergias: user.alergias
                    }
                });
                return [3 /*break*/, 5];
            case 4:
                error_1 = _b.sent();
                console.error(error_1);
                res.status(500).json({ message: "Error en el servidor" });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
// Ruta de registro
app.post("/api/register", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, fullName, phone, birthDate, location, email, contraseña, bloodType, alergias, existingUser, salt, hashedPassword, user, error_2;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, fullName = _a.fullName, phone = _a.phone, birthDate = _a.birthDate, location = _a.location, email = _a.email, contraseña = _a.contraseña, bloodType = _a.bloodType, alergias = _a.alergias;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 6, , 7]);
                return [4 /*yield*/, User.findOne({ email: email })];
            case 2:
                existingUser = _b.sent();
                if (existingUser) {
                    res.status(400).json({ message: "El usuario ya existe" });
                    return [2 /*return*/];
                }
                // Validar formato de teléfono (agregado explícitamente)
                if (!phone.match(/^\+52238[0-9]{7}$/)) {
                    res.status(400).json({ message: "Formato de teléfono inválido. Debe ser +52238 seguido de 7 dígitos" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, bcryptjs_1.default.genSalt(10)];
            case 3:
                salt = _b.sent();
                return [4 /*yield*/, bcryptjs_1.default.hash(contraseña, salt)];
            case 4:
                hashedPassword = _b.sent();
                user = new User({
                    fullName: fullName,
                    phone: phone,
                    birthDate: new Date(birthDate),
                    location: location,
                    email: email,
                    contraseña: hashedPassword,
                    bloodType: bloodType,
                    alergias: alergias,
                    emergencyContacts: []
                });
                return [4 /*yield*/, user.save()];
            case 5:
                _b.sent();
                res.status(201).json({ message: "Usuario registrado exitosamente" });
                return [3 /*break*/, 7];
            case 6:
                error_2 = _b.sent();
                console.error(error_2);
                if (error_2.name === 'ValidationError') {
                    res.status(400).json({ message: "Error de validación: " + error_2.message });
                }
                else {
                    res.status(500).json({ message: "Error en el servidor" });
                }
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
// Ruta para solicitar recuperación de contraseña
app.post("/api/reset-password", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var email, user, verificationCode, expires, mailOptions, error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                email = req.body.email;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, User.findOne({ email: email })];
            case 2:
                user = _a.sent();
                if (!user) {
                    // Por seguridad, no revelamos si el correo existe o no
                    res.status(200).json({ message: "Si el correo existe, recibirás instrucciones para recuperar tu contraseña" });
                    return [2 /*return*/];
                }
                verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
                expires = new Date();
                expires.setMinutes(expires.getMinutes() + 15);
                recoveryTokens[email] = { code: verificationCode, expires: expires };
                mailOptions = {
                    from: 'tigersos.app@gmail.com',
                    to: email,
                    subject: 'Recuperación de contraseña - TigerSOS',
                    html: "\n        <div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;\">\n          <h2>Recuperaci\u00F3n de contrase\u00F1a - TigerSOS</h2>\n          <p>Hola ".concat(user.fullName, ",</p>\n          <p>Has solicitado recuperar tu contrase\u00F1a. Utiliza el siguiente c\u00F3digo para continuar con el proceso:</p>\n          <div style=\"background-color: #f2f2f2; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;\">\n            ").concat(verificationCode, "\n          </div>\n          <p>Este c\u00F3digo expirar\u00E1 en 15 minutos.</p>\n          <p>Si no solicitaste cambiar tu contrase\u00F1a, puedes ignorar este correo.</p>\n          <p>Saludos,<br>Equipo TigerSOS</p>\n        </div>\n      ")
                };
                transporter.sendMail(mailOptions, function (error, info) {
                    if (error) {
                        console.error('Error al enviar correo:', error);
                        res.status(500).json({ message: "Error al enviar el correo" });
                    }
                    else {
                        res.status(200).json({ message: "Correo enviado correctamente" });
                    }
                });
                return [3 /*break*/, 4];
            case 3:
                error_3 = _a.sent();
                console.error(error_3);
                res.status(500).json({ message: "Error en el servidor" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// Ruta para confirmar cambio de contraseña
app.post("/api/reset-password-confirm", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, codigo, nuevaContrasena, email, user, salt, hashedPassword, error_4;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, codigo = _a.codigo, nuevaContrasena = _a.nuevaContrasena, email = _a.email;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 6, , 7]);
                // Verificar si el código es válido y no ha expirado
                if (!recoveryTokens[email] || recoveryTokens[email].code !== codigo) {
                    res.status(400).json({ message: "Código inválido" });
                    return [2 /*return*/];
                }
                if (new Date() > recoveryTokens[email].expires) {
                    delete recoveryTokens[email];
                    res.status(400).json({ message: "El código ha expirado" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, User.findOne({ email: email })];
            case 2:
                user = _b.sent();
                if (!user) {
                    res.status(400).json({ message: "Usuario no encontrado" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, bcryptjs_1.default.genSalt(10)];
            case 3:
                salt = _b.sent();
                return [4 /*yield*/, bcryptjs_1.default.hash(nuevaContrasena, salt)];
            case 4:
                hashedPassword = _b.sent();
                // Actualizar contraseña
                user.contraseña = hashedPassword;
                user.updatedAt = new Date();
                return [4 /*yield*/, user.save()];
            case 5:
                _b.sent();
                // Eliminar token de recuperación
                delete recoveryTokens[email];
                res.status(200).json({ message: "Contraseña actualizada correctamente" });
                return [3 /*break*/, 7];
            case 6:
                error_4 = _b.sent();
                console.error(error_4);
                res.status(500).json({ message: "Error en el servidor" });
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
// Ruta para añadir contacto de emergencia
app.post("/api/add-emergency-contact", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, userId, name, phone, isTutor, customMessage, user, error_5;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, userId = _a.userId, name = _a.name, phone = _a.phone, isTutor = _a.isTutor, customMessage = _a.customMessage;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 4, , 5]);
                return [4 /*yield*/, User.findById(userId)];
            case 2:
                user = _b.sent();
                if (!user) {
                    res.status(404).json({ message: "Usuario no encontrado" });
                    return [2 /*return*/];
                }
                // Validar número de contactos (máximo 3)
                if (user.emergencyContacts.length >= 3) {
                    res.status(400).json({ message: "Ya tienes el máximo de contactos permitidos (3)" });
                    return [2 /*return*/];
                }
                // Validar formato de teléfono
                if (!phone.match(/^\+52238[0-9]{7}$/)) { // CORREGIDO: Ahora espera 7 dígitos
                    res.status(400).json({ message: "Formato de teléfono inválido. Debe ser +52238 seguido de 7 dígitos" });
                    return [2 /*return*/];
                }
                // Validar mensaje personalizado (debe incluir {ubicación})
                if (!customMessage.includes('{ubicación}')) {
                    res.status(400).json({ message: "El mensaje debe incluir {ubicación}" });
                    return [2 /*return*/];
                }
                // Añadir contacto
                user.emergencyContacts.push({
                    name: name,
                    phone: phone,
                    isTutor: isTutor,
                    customMessage: customMessage,
                    createdAt: new Date()
                });
                user.updatedAt = new Date();
                return [4 /*yield*/, user.save()];
            case 3:
                _b.sent();
                res.status(200).json({ message: "Contacto agregado correctamente" });
                return [3 /*break*/, 5];
            case 4:
                error_5 = _b.sent();
                console.error(error_5);
                res.status(500).json({ message: "Error en el servidor" });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
// Ruta para obtener datos del usuario
app.get("/api/user/:id", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var user, error_6;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, User.findById(req.params.id)];
            case 1:
                user = _a.sent();
                if (!user) {
                    res.status(404).json({ message: "Usuario no encontrado" });
                    return [2 /*return*/];
                }
                res.json({
                    id: user._id,
                    fullName: user.fullName,
                    phone: user.phone,
                    birthDate: user.birthDate,
                    location: user.location,
                    email: user.email,
                    bloodType: user.bloodType,
                    alergias: user.alergias,
                    emergencyContacts: user.emergencyContacts
                });
                return [3 /*break*/, 3];
            case 2:
                error_6 = _a.sent();
                console.error(error_6);
                res.status(500).json({ message: "Error en el servidor" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// Ruta para actualizar contacto de emergencia
app.put("/api/update-emergency-contact/:userId", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, _a, contactId, name, phone, isTutor, customMessage, user, contactIndex, error_7;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                userId = req.params.userId;
                _a = req.body, contactId = _a.contactId, name = _a.name, phone = _a.phone, isTutor = _a.isTutor, customMessage = _a.customMessage;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 4, , 5]);
                return [4 /*yield*/, User.findById(userId)];
            case 2:
                user = _b.sent();
                if (!user) {
                    res.status(404).json({ message: "Usuario no encontrado" });
                    return [2 /*return*/];
                }
                contactIndex = user.emergencyContacts.findIndex(function (contact) { return contact._id.toString() === contactId; });
                if (contactIndex === -1) {
                    res.status(404).json({ message: "Contacto de emergencia no encontrado" });
                    return [2 /*return*/];
                }
                // Validar formato de teléfono
                if (!phone.match(/^\+52238[0-9]{7}$/)) {
                    res.status(400).json({ message: "Formato de teléfono inválido. Debe ser +52238 seguido de 7 dígitos" });
                    return [2 /*return*/];
                }
                // Validar mensaje personalizado (debe incluir {ubicación})
                if (!customMessage.includes('{ubicación}')) {
                    res.status(400).json({ message: "El mensaje debe incluir {ubicación}" });
                    return [2 /*return*/];
                }
                // Actualizar contacto de emergencia
                user.emergencyContacts[contactIndex] = __assign(__assign({}, user.emergencyContacts[contactIndex]), { name: name, phone: phone, isTutor: isTutor, customMessage: customMessage });
                user.updatedAt = new Date();
                return [4 /*yield*/, user.save()];
            case 3:
                _b.sent();
                res.status(200).json({
                    message: "Contacto de emergencia actualizado correctamente",
                    contact: user.emergencyContacts[contactIndex]
                });
                return [3 /*break*/, 5];
            case 4:
                error_7 = _b.sent();
                console.error(error_7);
                res.status(500).json({ message: "Error en el servidor", error: String(error_7) });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
// Ruta de prueba para verificar la conexión a MongoDB
app.get("/api/test-db", function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var error_8;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                // Intentar una simple operación de lectura para verificar la conexión
                return [4 /*yield*/, User.findOne({})];
            case 1:
                // Intentar una simple operación de lectura para verificar la conexión
                _a.sent();
                res.json({ message: "Conexión a MongoDB exitosa" });
                return [3 /*break*/, 3];
            case 2:
                error_8 = _a.sent();
                console.error("Error de prueba de conexión:", error_8);
                res.status(500).json({ message: "Error en la conexión a MongoDB", error: String(error_8) });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
var PORT = process.env.PORT || 5000;
app.listen(PORT, function () { return console.log("\uD83D\uDE80 Servidor corriendo en el puerto ".concat(PORT)); });
