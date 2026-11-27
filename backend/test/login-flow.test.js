const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  ALLOWED_FACULTY,
  ALLOWED_MAJOR,
  authenticateLogin,
  getTuAffiliationDebugInfo,
  getTuAffiliation,
  isDemoLoginEnabled,
  isTuAuthDebugEnabled,
  isAllowedAffiliation,
  isDemoLoginIdentifier,
  logTuAffiliationDebug
} = require("../utils/login-flow");

test("allows only the exact approved faculty and major", () => {
  assert.equal(isAllowedAffiliation(ALLOWED_FACULTY, ALLOWED_MAJOR), true);
  assert.equal(
    isAllowedAffiliation(ALLOWED_FACULTY, "วิทยาการคอมพิวเตอร์"),
    false
  );
  assert.equal(
    isAllowedAffiliation(ALLOWED_FACULTY, "วิทยาการคอมพิวเตอร์ประยุกต์"),
    false
  );
  assert.equal(
    isAllowedAffiliation("คณะอื่น", ALLOWED_MAJOR),
    false
  );
  assert.equal(isAllowedAffiliation("คณะอื่น", "สาขาอื่น"), false);
});

test("rejects absent, null, empty, and non-string affiliation fields", () => {
  for (const profile of [
    {},
    { faculty: null, major: ALLOWED_MAJOR },
    { faculty: "", major: ALLOWED_MAJOR },
    { faculty: ALLOWED_FACULTY },
    { faculty: ALLOWED_FACULTY, major: null },
    { faculty: ALLOWED_FACULTY, major: "" },
    { faculty: ALLOWED_FACULTY, major: 12 }
  ]) {
    assert.equal(
      isAllowedAffiliation(profile.faculty, profile.major),
      false
    );
  }
});

test("trims leading and trailing spaces before exact comparison", () => {
  assert.equal(
    isAllowedAffiliation(
      `  ${ALLOWED_FACULTY} `,
      `\t${ALLOWED_MAJOR}  `
    ),
    true
  );
});

test("maps affiliation only from the verified TU faculty and department fields", () => {
  const mappedAffiliation = getTuAffiliation({
    faculty_name: ALLOWED_FACULTY,
    department_name: ALLOWED_MAJOR,
    major: ALLOWED_MAJOR
  });

  assert.deepEqual(
    getTuAffiliation({
      faculty: ALLOWED_FACULTY,
      department: ALLOWED_MAJOR
    }),
    {
      faculty: ALLOWED_FACULTY,
      major: ALLOWED_MAJOR
    }
  );
  assert.deepEqual(getTuAffiliation({}), {
    faculty: undefined,
    major: undefined
  });
  assert.equal(
    isAllowedAffiliation(mappedAffiliation.faculty, mappedAffiliation.major),
    false
  );
});

test("does not persist or create a session when TU affiliation is not eligible", async () => {
  const calls = [];
  const result = await authenticateLogin(
    {
      identifier: "test-user",
      password: "mock-password"
    },
    {
      resolveLoginIdentifier: async (identifier) => {
        calls.push("resolve");
        return identifier;
      },
      verifyWithTuApi: async () => {
        calls.push("verify");
        return {
          data: {
            faculty: ALLOWED_FACULTY,
            department: "สาขาอื่น"
          },
          responsePath: "data"
        };
      },
      saveUser: async () => {
        calls.push("save");
      },
      createToken: () => {
        calls.push("create-session");
      }
    }
  );

  assert.deepEqual(result, { authorized: false });
  assert.deepEqual(calls, ["resolve", "verify"]);
});

test("rejects the previous major value before saving a user or creating a session", async () => {
  const calls = [];
  const result = await authenticateLogin(
    { identifier: "test-user", password: "mock-password" },
    {
      resolveLoginIdentifier: async (identifier) => identifier,
      verifyWithTuApi: async () => ({
        data: {
          faculty: ALLOWED_FACULTY,
          department: "วิทยาการคอมพิวเตอร์"
        },
        responsePath: "$"
      }),
      saveUser: async () => calls.push("save"),
      createToken: () => calls.push("create-session")
    }
  );

  assert.deepEqual(result, { authorized: false });
  assert.deepEqual(calls, []);
});

test("rejects incorrect or incomplete TU faculty and department before persistence", async () => {
  const profiles = [
    { faculty: "คณะอื่น", department: ALLOWED_MAJOR },
    { faculty: ALLOWED_FACULTY, department: "สาขาอื่น" },
    { faculty: ALLOWED_FACULTY },
    { department: ALLOWED_MAJOR },
    { faculty: null, department: ALLOWED_MAJOR },
    { faculty: ALLOWED_FACULTY, department: null },
    { faculty: "", department: ALLOWED_MAJOR },
    { faculty: ALLOWED_FACULTY, department: "" },
    { faculty: 123, department: ALLOWED_MAJOR },
    { faculty: ALLOWED_FACULTY, department: 123 },
    {
      faculty_name: ALLOWED_FACULTY,
      department_name: ALLOWED_MAJOR,
      major: ALLOWED_MAJOR
    }
  ];

  for (const profile of profiles) {
    const calls = [];
    const result = await authenticateLogin(
      { identifier: "test-user", password: "mock-password" },
      {
        resolveLoginIdentifier: async (identifier) => identifier,
        verifyWithTuApi: async () => ({
          data: profile,
          responsePath: "$"
        }),
        saveUser: async () => calls.push("save"),
        createToken: () => calls.push("create-session")
      }
    );

    assert.deepEqual(result, { authorized: false });
    assert.deepEqual(calls, []);
  }
});

test("ignores faculty and major supplied with the login request", async () => {
  const calls = [];
  const result = await authenticateLogin(
    {
      identifier: "test-user",
      password: "mock-password",
      faculty: ALLOWED_FACULTY,
      major: ALLOWED_MAJOR,
      role: "admin",
      access_level: "admin"
    },
    {
      resolveLoginIdentifier: async (identifier) => identifier,
      verifyWithTuApi: async () => ({
        data: {
          faculty: "คณะอื่น",
          department: "สาขาอื่น"
        },
        responsePath: "data"
      }),
      saveUser: async () => {
        calls.push("save");
      },
      createToken: () => {
        calls.push("create-session");
      }
    }
  );

  assert.deepEqual(result, { authorized: false });
  assert.deepEqual(calls, []);
});

test("does not persist or create a session when TU authentication fails", async () => {
  const calls = [];

  await assert.rejects(
    authenticateLogin(
      {
        identifier: "test-user",
        password: "mock-password"
      },
      {
        resolveLoginIdentifier: async (identifier) => identifier,
        verifyWithTuApi: async () => {
          throw new Error("mock TU authentication failure");
        },
        saveUser: async () => {
          calls.push("save");
        },
        createToken: () => {
          calls.push("create-session");
        }
      }
    ),
    /mock TU authentication failure/
  );

  assert.deepEqual(calls, []);
});

test("enables demo login only when explicitly enabled", () => {
  for (const env of [
    { NODE_ENV: "development", DEMO_LOGIN_ENABLED: "true" },
    { NODE_ENV: "production", DEMO_LOGIN_ENABLED: "true" },
    { NODE_ENV: "test", DEMO_LOGIN_ENABLED: "true" },
    { DEMO_LOGIN_ENABLED: "true" }
  ]) {
    assert.equal(isDemoLoginEnabled(env), true);
  }

  for (const env of [
    { NODE_ENV: "development", DEMO_LOGIN_ENABLED: "false" },
    { NODE_ENV: "development" },
    { NODE_ENV: "production", DEMO_LOGIN_ENABLED: "false" },
    { NODE_ENV: "production" },
    { DEMO_LOGIN_ENABLED: "false" },
    {}
  ]) {
    assert.equal(isDemoLoginEnabled(env), false);
  }
});

test("authenticates the demo admin with the fixed admin role and existing session flow", async () => {
  const calls = [];
  const result = await authenticateLogin(
    { identifier: "admin_demo", password: "mock-admin-password" },
    {
      env: {
        NODE_ENV: "development",
        DEMO_LOGIN_ENABLED: "true",
        DEMO_ADMIN_PASSWORD: "mock-admin-password"
      },
      resolveLoginIdentifier: async () => {
        calls.push("resolve");
      },
      verifyWithTuApi: async () => {
        calls.push("verify");
      },
      saveUser: async (userData) => {
        calls.push("save");
        assert.equal(userData.username, "admin_demo");
        assert.equal(userData.tu_id, "ADMINDEMO001");
        assert.equal(userData.role, "admin");
        return { user_id: 7, ...userData, access_level: "user" };
      },
      createToken: (user) => {
        calls.push("create-session");
        assert.equal(user.user_id, 7);
        assert.equal(user.role, "admin");
        assert.equal(user.access_level, "admin");
        return "mock-admin-session-token";
      }
    }
  );

  assert.equal(result.authorized, true);
  assert.equal(result.userData.role, "admin");
  assert.equal(result.savedUser.access_level, "admin");
  assert.equal(result.token, "mock-admin-session-token");
  assert.deepEqual(calls, ["save", "create-session"]);
});

test("authenticates the demo teacher without allowing request or stored admin access overrides", async () => {
  const calls = [];
  const result = await authenticateLogin(
    {
      identifier: "teacher_demo",
      password: "mock-teacher-password",
      role: "admin",
      access_level: "admin"
    },
    {
      env: {
        NODE_ENV: "development",
        DEMO_LOGIN_ENABLED: "true",
        DEMO_TEACHER_PASSWORD: "mock-teacher-password"
      },
      resolveLoginIdentifier: async () => {
        calls.push("resolve");
      },
      verifyWithTuApi: async () => {
        calls.push("verify");
      },
      saveUser: async (userData) => {
        calls.push("save");
        assert.equal(userData.username, "teacher_demo");
        assert.equal(userData.tu_id, "TEACHER001");
        assert.equal(userData.role, "teacher");
        return { user_id: 8, ...userData, access_level: "admin" };
      },
      createToken: (user) => {
        calls.push("create-session");
        assert.equal(user.role, "teacher");
        assert.equal(user.access_level, "user");
        return "mock-teacher-session-token";
      }
    }
  );

  assert.equal(result.authorized, true);
  assert.equal(result.userData.role, "teacher");
  assert.equal(result.token, "mock-teacher-session-token");
  assert.deepEqual(calls, ["save", "create-session"]);
});

test("rejects disabled demo environments and incorrect credentials without creating a session", async () => {
  const disabledEnvironments = [
  { NODE_ENV: "development", DEMO_LOGIN_ENABLED: "false" },
  { NODE_ENV: "development" },
  { NODE_ENV: "production", DEMO_LOGIN_ENABLED: "false" },
  { NODE_ENV: "production" },
  { DEMO_LOGIN_ENABLED: "false" },
  {}
  ];

  for (const [identifier, passwordEnvironmentVariable] of [
    ["admin_demo", "DEMO_ADMIN_PASSWORD"],
    ["teacher_demo", "DEMO_TEACHER_PASSWORD"]
  ]) {
    for (const env of disabledEnvironments) {
      const calls = [];
      const result = await authenticateLogin(
        { identifier, password: "mock-demo-password" },
        {
          env: {
            ...env,
            [passwordEnvironmentVariable]: "mock-demo-password"
          },
          resolveLoginIdentifier: async () => calls.push("resolve"),
          verifyWithTuApi: async () => calls.push("verify"),
          saveUser: async () => calls.push("save"),
          createToken: () => calls.push("create-session")
        }
      );

      assert.deepEqual(result, { authorized: false });
      assert.deepEqual(calls, []);
    }
  }

  for (const [identifier, passwordEnvironmentVariable] of [
    ["admin_demo", "DEMO_ADMIN_PASSWORD"],
    ["teacher_demo", "DEMO_TEACHER_PASSWORD"]
  ]) {
    const calls = [];
    const invalidCredentials = await authenticateLogin(
      { identifier, password: "wrong-mock-password" },
      {
        env: {
          NODE_ENV: "development",
          DEMO_LOGIN_ENABLED: "true",
          [passwordEnvironmentVariable]: "mock-correct-password"
        },
        resolveLoginIdentifier: async () => calls.push("resolve"),
        verifyWithTuApi: async () => calls.push("verify"),
        saveUser: async () => calls.push("save"),
        createToken: () => calls.push("create-session")
      }
    );

    assert.deepEqual(invalidCredentials, { authorized: false });
    assert.deepEqual(calls, []);
  }
  assert.equal(isDemoLoginIdentifier("teacher_demo"), true);
  assert.equal(isDemoLoginIdentifier("admin_demo"), true);
});

test("persists the normalized eligible TU profile before creating a session", async () => {
  const calls = [];
  const result = await authenticateLogin(
    {
      identifier: "test-user",
      password: "mock-password",
      role: "admin",
      access_level: "admin"
    },
    {
      resolveLoginIdentifier: async (identifier) => identifier,
      verifyWithTuApi: async () => ({
        data: {
          username: "test-user",
          faculty: ` ${ALLOWED_FACULTY} `,
          department: ` ${ALLOWED_MAJOR} `,
          type: "student"
        },
        responsePath: "data"
      }),
      saveUser: async (userData) => {
        calls.push("save");
        assert.equal(userData.faculty, ALLOWED_FACULTY);
        assert.equal(userData.major, ALLOWED_MAJOR);
        assert.equal(userData.role, "student");
        return {
          user_id: 7,
          ...userData,
          role: "admin",
          access_level: "admin"
        };
      },
      createToken: (user) => {
        calls.push("create-session");
        assert.equal(user.user_id, 7);
        assert.equal(user.role, "student");
        assert.equal(user.access_level, "user");
        return "mock-session-token";
      }
    }
  );

  assert.equal(result.authorized, true);
  assert.equal(result.savedUser.role, "student");
  assert.equal(result.savedUser.access_level, "user");
  assert.equal(result.token, "mock-session-token");
  assert.deepEqual(calls, ["save", "create-session"]);
});

test("debug info reports wrapper and selected field paths without unrelated response fields", () => {
  const rawResponse = {
    faculty: ALLOWED_FACULTY,
    department: ALLOWED_MAJOR,
    name: "Sensitive Person",
    email: "person@example.test",
    token: "secret-token",
    id: "123456789"
  };
  const info = getTuAffiliationDebugInfo(rawResponse, "data");

  assert.deepEqual(info, {
    responsePath: "data",
    faculty: {
      fieldPath: "data.faculty",
      present: true,
      type: "string",
      value: ALLOWED_FACULTY
    },
    major: {
      fieldPath: "data.department",
      present: true,
      type: "string",
      value: ALLOWED_MAJOR
    }
  });

  const output = JSON.stringify(info);
  for (const sensitiveValue of [
    "Sensitive Person",
    "person@example.test",
    "secret-token",
    "123456789"
  ]) {
    assert.equal(output.includes(sensitiveValue), false);
  }

  assert.deepEqual(
    getTuAffiliationDebugInfo({ faculty: null, department: 7 }, "$"),
    {
      responsePath: "$",
      faculty: {
        fieldPath: "$.faculty",
        present: true,
        type: "null",
        value: null
      },
      major: {
        fieldPath: "$.department",
        present: true,
        type: "number",
        value: "<number omitted>"
      }
    }
  );

  assert.deepEqual(getTuAffiliationDebugInfo({}, "$").faculty, {
    fieldPath: null,
    present: false,
    type: "undefined",
    value: "<missing>"
  });
});

test("debug logging is enabled only by explicit development settings", () => {
  assert.equal(
    isTuAuthDebugEnabled({
      NODE_ENV: "development",
      TU_AUTH_DEBUG: "true"
    }),
    true
  );
  assert.equal(
    isTuAuthDebugEnabled({
      NODE_ENV: "development",
      TU_AUTH_DEBUG: "false"
    }),
    false
  );
  assert.equal(
    isTuAuthDebugEnabled({
      NODE_ENV: "production",
      TU_AUTH_DEBUG: "true"
    }),
    false
  );

  const output = [];
  const logged = logTuAffiliationDebug(
    { faculty: ALLOWED_FACULTY, department: ALLOWED_MAJOR },
    "data",
    {
      env: { NODE_ENV: "development" },
      logger: (...args) => output.push(args)
    }
  );

  assert.equal(logged, false);
  assert.deepEqual(output, []);
});

test("logs sanitized affiliation fields before rejecting a non-matching user", async () => {
  const output = [];
  const calls = [];
  const result = await authenticateLogin(
    { identifier: "test-user", password: "mock-password" },
    {
      resolveLoginIdentifier: async (identifier) => identifier,
      verifyWithTuApi: async () => ({
        data: {
          faculty: "คณะอื่น",
          department: "สาขาอื่น",
          name: "Sensitive Person",
          email: "person@example.test",
          token: "secret-token"
        },
        responsePath: "Data"
      }),
      debugTuAffiliation: (data, responsePath) =>
        logTuAffiliationDebug(data, responsePath, {
          env: { NODE_ENV: "development", TU_AUTH_DEBUG: "true" },
          logger: (...args) => output.push(args)
        }),
      saveUser: async () => calls.push("save"),
      createToken: () => calls.push("create-session")
    }
  );

  assert.deepEqual(result, { authorized: false });
  assert.equal(output.length, 1);
  assert.equal(output[0][1].responsePath, "Data");
  assert.equal(output[0][1].faculty.value, "คณะอื่น");
  assert.equal(output[0][1].major.value, "สาขาอื่น");
  assert.deepEqual(calls, []);
  assert.equal(JSON.stringify(output).includes("Sensitive Person"), false);
  assert.equal(JSON.stringify(output).includes("person@example.test"), false);
  assert.equal(JSON.stringify(output).includes("secret-token"), false);
});

test("does not emit debug output when TU authentication errors", async () => {
  const output = [];

  await assert.rejects(
    authenticateLogin(
      { identifier: "test-user", password: "mock-password" },
      {
        resolveLoginIdentifier: async (identifier) => identifier,
        verifyWithTuApi: async () => {
          throw new Error("secret-bearing mock upstream error");
        },
        debugTuAffiliation: (data, responsePath) =>
          logTuAffiliationDebug(data, responsePath, {
            env: { NODE_ENV: "development", TU_AUTH_DEBUG: "true" },
            logger: (...args) => output.push(args)
          }),
        saveUser: async () => {
          assert.fail("TU error must not persist a user");
        },
        createToken: () => {
          assert.fail("TU error must not create a session");
        }
      }
    ),
    /secret-bearing mock upstream error/
  );

  assert.deepEqual(output, []);
});
test("allows demo login in production when enabled", () => {
  assert.equal(
    isDemoLoginEnabled({
      NODE_ENV: "production",
      DEMO_LOGIN_ENABLED: "true"
    }),
    true
  );
});

test("rejects demo login in production when disabled", () => {
  assert.equal(
    isDemoLoginEnabled({
      NODE_ENV: "production",
      DEMO_LOGIN_ENABLED: "false"
    }),
    false
  );
});