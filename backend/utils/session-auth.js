function getSession(req, sessions) {
  const authorization = String(req.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return null;
  }

  const session = sessions.get(match[1].trim());

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(match[1].trim());
    return null;
  }

  return session;
}

function createAuthenticateSession(sessions) {
  return function authenticateSession(req, res, next) {
    const session = getSession(req, sessions);

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "กรุณาเข้าสู่ระบบใหม่"
      });
    }

    req.session = session;
    next();
  };
}

function requireAdmin(req, res, next) {
  if (!req.session || req.session.accessLevel !== "admin") {
    return res.status(403).json({
      success: false,
      message: "คุณไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ"
    });
  }

  next();
}

module.exports = {
  createAuthenticateSession,
  getSession,
  requireAdmin
};
