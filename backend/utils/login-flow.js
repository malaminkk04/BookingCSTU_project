const ALLOWED_FACULTY = "คณะวิทยาศาสตร์และเทคโนโลยี";
const ALLOWED_MAJOR = "ภาควิชาวิทยาการคอมพิวเตอร์";
const LOGIN_RESTRICTION_MESSAGE =
  "ขออภัย ระบบนี้อนุญาตให้ใช้งานเฉพาะนักศึกษาและบุคลากรคณะวิทยาศาสตร์และเทคโนโลยี สาขาวิทยาการคอมพิวเตอร์เท่านั้น";

const DEMO_LOGIN_ACCOUNTS = {
  admin_demo: {
    passwordEnvironmentVariable: "DEMO_ADMIN_PASSWORD",
    userData: {
      username: "admin_demo",
      tu_id: "ADMINDEMO001",
      email: "admin.demo@example.com",
      displayname_th: "ผู้ดูแลระบบตัวอย่าง",
      faculty: ALLOWED_FACULTY,
      major: "Computer Science",
      role: "admin"
    }
  },
  teacher_demo: {
    passwordEnvironmentVariable: "DEMO_TEACHER_PASSWORD",
    userData: {
      username: "teacher_demo",
      tu_id: "TEACHER001",
      email: "teacher.demo@example.com",
      displayname_th: "อาจารย์ตัวอย่าง",
      faculty: ALLOWED_FACULTY,
      major: "Computer Science",
      role: "teacher"
    }
  }
};
const DEMO_LOGIN_IDENTIFIERS = new Set(Object.keys(DEMO_LOGIN_ACCOUNTS));
const FACULTY_FIELD_CANDIDATES = ["faculty"];
const MAJOR_FIELD_CANDIDATES = ["department"];

function normalizeAffiliation(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isAllowedAffiliation(faculty, major) {
  return (
    normalizeAffiliation(faculty) === ALLOWED_FACULTY &&
    normalizeAffiliation(major) === ALLOWED_MAJOR
  );
}

function isDemoLoginIdentifier(identifier) {
  return DEMO_LOGIN_IDENTIFIERS.has(
    String(identifier || "").trim().toLowerCase()
  );
}

function isDemoLoginEnabled(env = process.env) {
  return (
    env.NODE_ENV === "development" &&
    env.DEMO_LOGIN_ENABLED === "true"
  );
}

function getTuAffiliation(data) {
  const response = data && typeof data === "object" ? data : {};

  return {
    faculty: response.faculty,
    major: response.department
  };
}

function getFieldDebugInfo(response, fieldCandidates, responsePath) {
  const selectedField = fieldCandidates.find((field) => response[field]);
  const existingField =
    selectedField ||
    fieldCandidates.find((field) =>
      Object.prototype.hasOwnProperty.call(response, field)
    );

  if (!existingField) {
    return {
      fieldPath: null,
      present: false,
      type: "undefined",
      value: "<missing>"
    };
  }

  const value = response[existingField];
  const type = value === null ? "null" : typeof value;

  return {
    fieldPath: `${responsePath}.${existingField}`,
    present: true,
    type,
    value: sanitizeDebugValue(value)
  };
}

function sanitizeDebugValue(value) {
  if (typeof value !== "string") {
    return value === null ? null : `<${typeof value} omitted>`;
  }

  const sanitized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);

  if (
    /@|https?:\/\/|\b\d{6,}\b/i.test(sanitized)
  ) {
    return "<redacted>";
  }

  return sanitized;
}

function getTuAffiliationDebugInfo(data, responsePath) {
  const response = data && typeof data === "object" ? data : {};

  return {
    responsePath,
    faculty: getFieldDebugInfo(
      response,
      FACULTY_FIELD_CANDIDATES,
      responsePath
    ),
    major: getFieldDebugInfo(
      response,
      MAJOR_FIELD_CANDIDATES,
      responsePath
    )
  };
}

function isTuAuthDebugEnabled(env = process.env) {
  return (
    env.NODE_ENV === "development" &&
    env.TU_AUTH_DEBUG === "true"
  );
}

function logTuAffiliationDebug(
  data,
  responsePath,
  { env = process.env, logger = console.info } = {}
) {
  if (!isTuAuthDebugEnabled(env)) {
    return false;
  }

  logger(
    "[TU_AUTH_DEBUG]",
    getTuAffiliationDebugInfo(data, responsePath)
  );
  return true;
}

function getUserRole(accountType) {
  const type = String(accountType || "").trim().toLowerCase();
  return type === "student" ? "student" : "teacher";
}

async function authenticateLogin(
  { identifier, password },
  {
    resolveLoginIdentifier,
    verifyWithTuApi,
    saveUser,
    createToken,
    debugTuAffiliation = () => {},
    env = process.env
  }
) {
  if (isDemoLoginIdentifier(identifier)) {
    const normalizedIdentifier = String(identifier).trim().toLowerCase();
    const demoAccount = DEMO_LOGIN_ACCOUNTS[normalizedIdentifier];
    const expectedPassword = env[demoAccount.passwordEnvironmentVariable];

    if (
      !isDemoLoginEnabled(env) ||
      typeof expectedPassword !== "string" ||
      expectedPassword.length === 0 ||
      password !== expectedPassword
    ) {
      return { authorized: false };
    }

    const userData = { ...demoAccount.userData };
    const savedUser = await saveUser(userData);

    if (!savedUser || !savedUser.user_id) {
      throw new Error("Unable to save or load demo user account");
    }

    const authenticatedUser = {
      ...savedUser,
      ...userData,
      access_level: userData.role === "admin" ? "admin" : "user"
    };
    const token = createToken(authenticatedUser);

    return {
      authorized: true,
      userData,
      savedUser: authenticatedUser,
      token
    };
  }

  const loginIdentifier = await resolveLoginIdentifier(identifier);
  const { data: responseData, responsePath } = await verifyWithTuApi(
    loginIdentifier,
    password
  );
  const data =
    responseData && typeof responseData === "object" ? responseData : {};

  debugTuAffiliation(data, responsePath);

  const { faculty, major } = getTuAffiliation(data);

  if (!isAllowedAffiliation(faculty, major)) {
    return { authorized: false };
  }

  const username = String(
    data.username ||
      data.username_en ||
      data.username_th ||
      loginIdentifier
  ).trim();

  const tuId = String(
    data.id ||
      data.tu_id ||
      data.username ||
      loginIdentifier
  ).trim();

  const accountType =
    data.type ||
    data.account_type ||
    data.accountType ||
    data.user_type ||
    data.userType ||
    data.status ||
    "";

  const userData = {
    username,
    tu_id: tuId,
    email: data.email || data.email_address || null,
    displayname_th:
      data.displayname_th ||
      data.displayname ||
      data.name_th ||
      data.name ||
      username,
    faculty: normalizeAffiliation(faculty),
    major: normalizeAffiliation(major),
    role: getUserRole(accountType)
  };

  const savedUser = await saveUser(userData);
  const token = createToken(savedUser);

  return {
    authorized: true,
    userData,
    savedUser,
    token
  };
}

module.exports = {
  ALLOWED_FACULTY,
  ALLOWED_MAJOR,
  LOGIN_RESTRICTION_MESSAGE,
  authenticateLogin,
  getTuAffiliationDebugInfo,
  getTuAffiliation,
  isDemoLoginEnabled,
  isTuAuthDebugEnabled,
  isAllowedAffiliation,
  isDemoLoginIdentifier,
  logTuAffiliationDebug,
  normalizeAffiliation
};
