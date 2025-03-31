import express from "express";
const { Request, Response, NextFunction } = express;

// El resto de importaciones se mantienen igual
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";

// ELIMINAMOS ESTAS IMPORTACIONES
// import { isAdmin } from './middlewares/auth';
// import User from './models/User';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// Validar variables de entorno
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error("MONGO_URI no está definido");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no está definido");

// Conexión a MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch(err => console.error("❌ Error de conexión:", err));

// Interfaces y esquemas
interface IEmergencyContact {
  _id?: mongoose.Types.ObjectId;
  name: string;
  phone: string;
  isTutor: boolean;
  customMessage: string;
  parentesco?: string;
  createdAt: Date;
}

// IMPORTANTE: Definir primero el esquema de contacto de emergencia antes de usarlo
const emergencyContactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, match: /^\+52[0-9]{10}$/ },
  isTutor: { type: Boolean, required: true },
  customMessage: { type: String, required: true, validate: /.*\{ubicación\}.*/ },
  parentesco: { type: String, default: 'Otro' },
  createdAt: { type: Date, default: Date.now }
});

// Esquema de alerta de emergencia
interface IAlert {
  userId: mongoose.Types.ObjectId;
  timestamp: Date;
  location?: string;
  status: string;
  resolvedAt?: Date;
  resolvedBy?: mongoose.Types.ObjectId;
}

const alertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'usuarios', required: true },
  timestamp: { type: Date, default: Date.now },
  location: { type: String },
  status: { type: String, enum: ["active", "resolved", "cancelled"], default: "active" },
  resolvedAt: { type: Date },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'usuarios' }
});

const Alert = mongoose.model<IAlert>("alertas", alertSchema);

// Modificación del esquema de usuario para incluir roles
interface IUser {
  fullName: string;
  phone: string;
  birthDate: Date;
  location: string;
  email: string;
  contraseña: string;
  bloodType: string;
  alergias: string[];
  gender?: string;
  role: string; // Nuevo campo para roles: "user" o "admin"
  emergencyContacts: IEmergencyContact[];
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  phone: { type: String, required: true, match: /^\+52[0-9]{10}$/ },
  birthDate: { type: Date },
  location: { type: String, default: "Tehuacán, Puebla" },
  // Simplificamos la validación para aceptar cualquier correo electrónico
  email: {
    type: String,
    required: true,
    unique: true
    // Eliminamos cualquier validación match para correos
  },
  contraseña: { type: String, required: true, minlength: 8 },
  bloodType: { type: String, required: true, enum: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] },
  alergias: { type: [String], default: [] },
  gender: { type: String, enum: ["Hombre", "Mujer", "Otro"] },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  emergencyContacts: [emergencyContactSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Validador personalizado para los correos
userSchema.path('email').validate(function(email: string) {
  // Si el usuario es admin, permitir cualquier formato de correo
  if (this.role === 'admin') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  } else {
    // Para usuarios normales, mantener la restricción de correo institucional
    return /^a[0-9]{10}@alumno\.uttehuacan\.edu\.mx$/.test(email);
  }
}, 'Formato de correo electrónico inválido. Los estudiantes deben usar su correo institucional.');

const User = mongoose.model<IUser>("usuarios", userSchema);

// Configurar nodemailer (para recuperación de contraseña)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'tigersos.app@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'tu_contraseña_segura'
  }
});

// Almacén temporal para códigos de recuperación
const recoveryTokens: Record<string, { code: string, expires: Date }> = {};

// Middleware para verificar si el usuario es administrador
const isAdmin = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Obtener token de Authorization header
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      res.status(401).json({ message: "No hay token, autorización denegada" });
      return;
    }

    // Verificar token
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string, role: string };

    // Verificar si el usuario es administrador
    if (decoded.role !== "admin") {
      res.status(403).json({ message: "Acceso denegado, se requiere rol de administrador" });
      return;
    }

    next();
  } catch (error) {
    console.error(error);
    res.status(401).json({ message: "Token no válido" });
  }
};

// Middleware para verificar autenticación general
const auth = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Obtener token de Authorization header
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      res.status(401).json({ message: "No hay token, autorización denegada" });
      return;
    }

    // Verificar token
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string, role: string };

    // Agregar el ID de usuario al objeto de solicitud para su uso posterior
    (req as any).userId = decoded.id;
    (req as any).userRole = decoded.role;

    next();
  } catch (error) {
    console.error(error);
    res.status(401).json({ message: "Token no válido" });
  }
};

// Ruta de login
app.post("/api/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      res.status(400).json({ message: "Usuario no encontrado" });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.contraseña);
    if (!isMatch) {
      res.status(400).json({ message: "Contraseña incorrecta" });
      return;
    }

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "24h" });
    res.json({
      message: "Inicio de sesión exitoso",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        bloodType: user.bloodType,
        alergias: user.alergias,
        role: user.role // Incluir el rol en la respuesta
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// Ruta de registro - CORREGIDA
app.post("/api/register", async (req: Request, res: Response): Promise<void> => {
  const { fullName, phone, birthDate, location, email, contraseña, bloodType, alergias, gender } = req.body;

  console.log("Datos recibidos:", req.body);

  try {
    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ message: "El usuario ya existe" });
      return;
    }

    // Validar formato de teléfono
    if (!phone.match(/^\+52[0-9]{10}$/)) {
      res.status(400).json({ message: "Formato de teléfono inválido. Debe ser +52 seguido de 10 dígitos" });
      return;
    }

    // Encriptar la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(contraseña, salt);

    // Crear nuevo usuario
    const user = new User({
      fullName,
      phone,
      birthDate: new Date(birthDate),
      location: location || "Tehuacán, Puebla",
      email,
      contraseña: hashedPassword,
      bloodType,
      alergias: Array.isArray(alergias) ? alergias : [alergias],
      gender, // Añadido el género
      role: "user", // Por defecto, todos son usuarios normales
      emergencyContacts: []
    });

    console.log("Intentando guardar usuario:", user);
    await user.save();
    console.log("Usuario guardado exitosamente");

    res.status(201).json({ message: "Usuario registrado exitosamente" });
  } catch (error: any) {
    console.error("Error al registrar usuario:", error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err: any) => err.message);
      res.status(400).json({ message: "Error de validación", errors: messages });
    } else if (error.code === 11000) {
      res.status(400).json({ message: "El correo electrónico ya está registrado" });
    } else {
      res.status(500).json({ message: "Error en el servidor", error: error.message });
    }
  }
});


// Ruta para solicitar recuperación de contraseña
app.post("/api/reset-password", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      // Por seguridad, no revelamos si el correo existe o no
      res.status(200).json({ message: "Si el correo existe, recibirás instrucciones para recuperar tu contraseña" });
      return;
    }

    // Generar código de verificación
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Almacenar código con tiempo de expiración (15 minutos)
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 15);
    recoveryTokens[email] = { code: verificationCode, expires };

    // Enviar correo
    const mailOptions = {
      from: 'tigersos.app@gmail.com',
      to: email,
      subject: 'Recuperación de contraseña - TigerSOS',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Recuperación de contraseña - TigerSOS</h2>
          <p>Hola ${user.fullName},</p>
          <p>Has solicitado recuperar tu contraseña. Utiliza el siguiente código para continuar con el proceso:</p>
          <div style="background-color: #f2f2f2; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${verificationCode}
          </div>
          <p>Este código expirará en 15 minutos.</p>
          <p>Si no solicitaste cambiar tu contraseña, puedes ignorar este correo.</p>
          <p>Saludos,<br>Equipo TigerSOS</p>
        </div>
      `
    };

    transporter.sendMail(mailOptions, (error: any, info: any) => {
      if (error) {
        console.error('Error al enviar correo:', error);
        res.status(500).json({ message: "Error al enviar el correo" });
      } else {
        res.status(200).json({ message: "Correo enviado correctamente" });
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// Ruta para confirmar cambio de contraseña
app.post("/api/reset-password-confirm", async (req: Request, res: Response): Promise<void> => {
  const { codigo, nuevaContrasena, email } = req.body;

  try {
    // Verificar si el código es válido y no ha expirado
    if (!recoveryTokens[email] || recoveryTokens[email].code !== codigo) {
      res.status(400).json({ message: "Código inválido" });
      return;
    }

    if (new Date() > recoveryTokens[email].expires) {
      delete recoveryTokens[email];
      res.status(400).json({ message: "El código ha expirado" });
      return;
    }

    // Buscar usuario
    const user = await User.findOne({ email });
    if (!user) {
      res.status(400).json({ message: "Usuario no encontrado" });
      return;
    }

    // Encriptar nueva contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(nuevaContrasena, salt);

    // Actualizar contraseña
    user.contraseña = hashedPassword;
    user.updatedAt = new Date();
    await user.save();

    // Eliminar token de recuperación
    delete recoveryTokens[email];

    res.status(200).json({ message: "Contraseña actualizada correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// Ruta para añadir contacto de emergencia - CORREGIDA
app.post("/api/add-emergency-contact", async (req: Request, res: Response): Promise<void> => {
  const { userId, name, phone, isTutor, customMessage, parentesco } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    // Check if contact with same phone number already exists
    const phoneExists = user.emergencyContacts.some(contact => contact.phone === phone);
    if (phoneExists) {
      res.status(400).json({ message: "Este número de teléfono ya está registrado como contacto de emergencia" });
      return;
    }

    // Validaciones importantes
    if (user.emergencyContacts.length >= 3) {
      res.status(400).json({ message: "Ya tienes el máximo de contactos permitidos (3)" });
      return;
    }

    // Check for duplicate phone numbers
    const isDuplicate = user.emergencyContacts.some(contact => contact.phone === phone);
    if (isDuplicate) {
      res.status(400).json({ message: "Ya existe un contacto con este número de teléfono" });
      return;
    }

    // Validar formato de teléfono
    if (!phone.match(/^\+52[0-9]{10}$/)) {
      res.status(400).json({ message: "Formato de teléfono inválido. Debe ser +52 seguido de 10 dígitos" });
      return;
    }

    // Validar mensaje personalizado
    if (!customMessage.includes('{ubicación}')) {
      res.status(400).json({ message: "El mensaje debe incluir {ubicación}" });
      return;
    }

    // Añadir contacto
    user.emergencyContacts.push({
      name,
      phone,
      isTutor,
      parentesco: parentesco || 'Otro',
      customMessage,
      createdAt: new Date()
    });

    user.updatedAt = new Date();
    await user.save();

    res.status(200).json({ message: "Contacto agregado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// Ruta para obtener datos del usuario
app.get("/api/user/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
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
      gender: user.gender,
      role: user.role, // Incluir el rol en la respuesta
      emergencyContacts: user.emergencyContacts
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// Ruta de prueba para verificar la conexión a MongoDB
app.get("/api/test-db", async (_req: Request, res: Response): Promise<void> => {
  try {
    // Intentar una simple operación de lectura para verificar la conexión
    await User.findOne({});
    res.json({ message: "Conexión a MongoDB exitosa" });
  } catch (error) {
    console.error("Error de prueba de conexión:", error);
    res.status(500).json({ message: "Error en la conexión a MongoDB", error: String(error) });
  }
});

// Ruta para actualizar datos del usuario
app.put("/api/user/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.id;
    const { fullName, phone, location } = req.body;

    // Validaciones
    if (!fullName || !phone || !location) {
      res.status(400).json({ message: "Todos los campos son requeridos" });
      return;
    }

    // Validar formato de teléfono
    if (!phone.match(/^\+52[0-9]{10}$/)) {
      res.status(400).json({ message: "Formato de teléfono inválido. Debe ser +52 seguido de 10 dígitos" });
      return;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        fullName,
        phone,
        location,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );

    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    res.json({
      message: "Datos actualizados correctamente",
      user: {
        id: user._id,
        fullName: user.fullName,
        phone: user.phone,
        location: user.location,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// Ruta para actualizar contacto de emergencia - CORREGIDA
app.put("/api/update-emergency-contact/:userId", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;
  const { contactId, name, phone, isTutor, parentesco, customMessage } = req.body;

  console.log('Actualización de contacto:', {userId, contactId, data: req.body});

  try {
    // Verificar si el usuario existe
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    // Verificar si el contacto existe
    const contactExists = user.emergencyContacts.some(
      contact => contact._id?.toString() === contactId
    );

    if (!contactExists) {
      res.status(404).json({ message: "Contacto no encontrado" });
      return;
    }

    // Validar formato de teléfono
    if (!phone.match(/^\+52[0-9]{10}$/)) {
      res.status(400).json({ message: "Formato de teléfono inválido. Debe ser +52 seguido de 10 dígitos" });
      return;
    }

    // Validar mensaje personalizado
    if (!customMessage.includes('{ubicación}')) {
      res.status(400).json({ message: "El mensaje debe incluir {ubicación}" });
      return;
    }

    // Actualizar el contacto
    const updateResult = await User.updateOne(
      {
        _id: userId,
        "emergencyContacts._id": contactId
      },
      {
        $set: {
          "emergencyContacts.$.name": name,
          "emergencyContacts.$.phone": phone,
          "emergencyContacts.$.isTutor": isTutor,
          "emergencyContacts.$.parentesco": parentesco || 'familiar',
          "emergencyContacts.$.customMessage": customMessage,
          "updatedAt": new Date()
        }
      },
      {
        runValidators: true
      }
    );

    if (updateResult.modifiedCount === 0) {
      res.status(404).json({ message: "No se realizaron cambios" });
      return;
    }

    // Obtener los datos actualizados
    const updatedUser = await User.findById(userId);
    const updatedContact = updatedUser?.emergencyContacts.find(
      contact => contact._id?.toString() === contactId
    );

    // Asegurarse de enviar toda la información necesaria para la navegación correcta
    res.status(200).json({
      message: "Contacto actualizado correctamente",
      contact: updatedContact,
      success: true,
      redirectTo: "/usuario" // Añadir información de redirección explícita
    });
  } catch (error) {
    console.error('Error al actualizar contacto:', error);

    if (error instanceof mongoose.Error.ValidationError) {
      res.status(400).json({
        message: "Error de validación",
        errors: Object.values(error.errors).map(err => err.message)
      });
    } else {
      res.status(500).json({
        message: "Error en el servidor",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
});

// Ruta para crear una alerta de emergencia
app.post("/api/emergency-alert", async (req: Request, res: Response): Promise<void> => {
  const { userId, location } = req.body;

  try {
    // Verificar si el usuario existe
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    // Crear la alerta
    const alert = new Alert({
      userId,
      location,
      timestamp: new Date(),
      status: "active"
    });

    await alert.save();

    res.status(200).json({
      message: "Alerta registrada exitosamente",
      alertId: alert._id
    });
  } catch (error) {
    console.error("Error al registrar alerta:", error);
    res.status(500).json({ message: "Error al registrar la alerta" });
  }
});

// Ruta para obtener alertas del usuario
app.get("/api/user-alerts/:userId", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;

  try {
    const alerts = await Alert.find({ userId })
      .sort({ timestamp: -1 });

    res.json(alerts);
  } catch (error) {
    console.error("Error al obtener alertas del usuario:", error);
    res.status(500).json({ message: "Error al obtener alertas" });
  }
});

// Rutas de administrador
// Dashboard con estadísticas
app.get("/api/admin/dashboard", isAdmin, async (req: Request, res: Response) => {
  try {
    // Obtener estadísticas totales para el panel de administración
    const totalUsers = await User.countDocuments();
    const usersWithoutContacts = await User.countDocuments({ "emergencyContacts.0": { $exists: false } });
    const activeAlerts = await Alert.countDocuments({ status: "active" });

    res.json({
      totalUsers,
      usersWithoutContacts,
      usersWithContacts: totalUsers - usersWithoutContacts,
      alertsTriggered: activeAlerts
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// Ruta para listar todos los usuarios (solo admin)
app.get("/api/admin/users", isAdmin, async (req: Request, res: Response) => {
  try {
    const users = await User.find({}, {
      _id: 1,
      fullName: 1,
      email: 1,
      phone: 1,
      bloodType: 1,
      createdAt: 1,
      emergencyContacts: 1
    });

    // Formatear la respuesta para incluir el conteo de contactos
    const formattedUsers = users.map(user => ({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      bloodType: user.bloodType,
      createdAt: user.createdAt,
      emergencyContacts: user.emergencyContacts.length
    }));

    res.json(formattedUsers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// Ruta para obtener detalles de un usuario específico
app.get("/api/admin/users/:id", isAdmin, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// Ruta para obtener todas las alertas (admin)
app.get("/api/admin/alerts", isAdmin, async (req: Request, res: Response) => {
  try {
    // Obtener todas las alertas con información de usuario
    const alerts = await Alert.find()
      .populate('userId', 'fullName email phone')
      .sort({ timestamp: -1 });

    res.json(alerts);
  } catch (error) {
    console.error("Error al obtener alertas:", error);
    res.status(500).json({ message: "Error al obtener alertas" });
  }
});

// Ruta para marcar una alerta como resuelta
app.put("/api/admin/alerts/:alertId", isAdmin, async (req: Request, res: Response) => {
  const { alertId } = req.params;
  const { status, resolvedBy } = req.body;

  try {
    const alert = await Alert.findById(alertId);
    if (!alert) {
      res.status(404).json({ message: "Alerta no encontrada" });
      return;
    }

    // Actualizar el estado de la alerta
    alert.status = status || "resolved";
    if (status === "resolved") {
      alert.resolvedAt = new Date();
      alert.resolvedBy = resolvedBy;
    }

    await alert.save();

    res.status(200).json({
      message: "Alerta actualizada correctamente",
      alert
    });
  } catch (error) {
    console.error("Error al actualizar alerta:", error);
    res.status(500).json({ message: "Error al actualizar la alerta" });
  }
});

// Ruta para asignar rol de administrador a un usuario
app.put("/api/admin/make-admin/:id", isAdmin, async (req: Request, res: Response) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: "admin" },
      { new: true }
    );

    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    res.json({
      message: "Usuario actualizado a administrador exitosamente",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// IMPORTANTE: Este endpoint debe ser temporal y eliminado después de usarse
app.post("/api/create-admin", async (req: Request, res: Response): Promise<void> => {
  const { email, secretKey } = req.body;

  // Clave secreta para protección básica
  if (secretKey !== "tiger2024") {
    res.status(403).json({ message: "No autorizado" });
    return;
  }

  try {
    // Usar el email proporcionado o el predeterminado
    const userEmail = email || "a3523110156@alumno.uttehuacan.edu.mx";

    const result = await User.updateOne(
      { email: userEmail },
      { $set: { role: "admin" } }
    );

    if (result.matchedCount === 0) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    if (result.modifiedCount === 0) {
          res.status(200).json({ message: "No se realizaron cambios, el usuario posiblemente ya es administrador" });
          return;
        }

        res.json({ message: `Usuario ${userEmail} establecido como administrador exitosamente` });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el servidor" });
      }
    });

    // Ruta para configuración del sistema (solo admin)
    app.get("/api/admin/settings", isAdmin, async (req: Request, res: Response) => {
      try {
        // Aquí podrías implementar la obtención de configuraciones desde una colección específica
        // Por ahora, devolvemos valores por defecto
        res.json({
          maxEmergencyContacts: 3,
          alertTimeout: 5, // segundos
          appVersion: "1.0.0",
          requireLocationForAlert: true
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el servidor" });
      }
    });

    // Ruta para actualizar configuraciones (solo admin)
    app.put("/api/admin/settings", isAdmin, async (req: Request, res: Response) => {
      try {
        // Aquí implementarías la actualización de configuraciones
        // Por ahora, solo confirmamos la recepción
        res.json({
          message: "Configuración actualizada correctamente",
          settings: req.body
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el servidor" });
      }
    });

// Ruta para crear una alerta de emergencia
app.post("/api/emergency-alert", async (req: Request, res: Response): Promise<void> => {
  const { userId, location } = req.body;

  try {
    // Verificar si el usuario existe
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    // Crear la alerta
    const alert = new Alert({
      userId,
      location,
      timestamp: new Date(),
      status: "active"
    });

    await alert.save();
    console.log("Alerta guardada exitosamente:", alert);

    res.status(200).json({
      message: "Alerta registrada exitosamente",
      alertId: alert._id
    });
  } catch (error) {
    console.error("Error al registrar alerta:", error);
    res.status(500).json({ message: "Error al registrar la alerta" });
  }
});

// Ruta para obtener todas las alertas (admin)
app.get("/api/admin/alerts", isAdmin, async (req: Request, res: Response) => {
  try {
    // Obtener todas las alertas con información de usuario
    const alerts = await Alert.find()
      .populate('userId', 'fullName email phone')
      .sort({ timestamp: -1 });

    console.log("Alertas encontradas:", alerts.length);
    res.json(alerts);
  } catch (error) {
    console.error("Error al obtener alertas:", error);
    res.status(500).json({ message: "Error al obtener alertas" });
  }
});





app.post(
  "/api/admin/create-admin",
  isAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Código de depuración
      console.log('=== DEBUG - PETICIÓN RECIBIDA ===');
      console.log('Cuerpo de la solicitud:', req.body);

      const {
        fullName,
        email,
        phone,
        contraseña
      } = req.body;

      // Validaciones básicas
      if (!fullName || !email || !phone || !contraseña) {
        res.status(400).json({ message: "Todos los campos son requeridos" });
        return;
      }

      // Validación básica de correo
      if (!email.includes('@') || !email.includes('.')) {
        res.status(400).json({ message: "Formato de correo electrónico inválido" });
        return;
      }

      // Validar formato de teléfono
      if (!phone.match(/^\+52[0-9]{10}$/)) {
        res.status(400).json({ message: "Formato de teléfono inválido. Debe ser +52 seguido de 10 dígitos" });
        return;
      }

      // Verificar si el usuario ya existe
      const existingUser = await User.findOne({
        $or: [
          { email },
          { phone }
        ]
      });

      if (existingUser) {
        res.status(400).json({ message: "Ya existe un usuario con este correo o teléfono" });
        return;
      }

      // Encriptar la contraseña
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(contraseña, salt);

      try {
        // Usar insertOne directamente para evitar validaciones del esquema
        const result = await mongoose.connection.collection('usuarios').insertOne({
          fullName,
          email,
          phone,
          contraseña: hashedPassword,
          role: "admin",
          birthDate: new Date(),
          location: "Tehuacán, Puebla",
          emergencyContacts: [],
          alergias: [],
          createdAt: new Date(),
          updatedAt: new Date()
        });

        // Respuesta exitosa
        res.status(201).json({
          message: "Administrador creado exitosamente",
          user: {
            id: result.insertedId,
            fullName,
            email,
            role: "admin"
          }
        });
      } catch (dbError: any) {
        console.error("Error al insertar en la base de datos:", dbError);
        res.status(500).json({
          message: "Error al crear el administrador en la base de datos",
          error: dbError.message || String(dbError)
        });
      }
    } catch (error: any) {
      console.error("Error al crear administrador:", error);
      res.status(500).json({
        message: "Error en el servidor",
        error: error.message || String(error)
      });
    }
  }
);


const PORT = process.env.PORT || 10000;

app.listen(PORT, () => console.log(`🚀 Servidor corriendo en el puerto ${PORT}`));
