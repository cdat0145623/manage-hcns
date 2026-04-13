import { initAuth } from "@kan/auth/server";
import { createDrizzleClient } from "@kan/db/client";

async function main() {
  const db = createDrizzleClient();
  const auth = initAuth(db);

  const adminEmail = process.env.ADMIN_EMAIL || "admin@kan.bn";
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error("Please set ADMIN_PASSWORD environment variable.");
    process.exit(1);
  }

  console.log(`Creating admin user: ${adminUsername} (${adminEmail})...`);

  try {
    const response = await auth.api.signUpUsername({
      body: {
        username: adminUsername,
        password: adminPassword,
        name: "Administrator",
        email: adminEmail,
        emailVerified: true,
        role: "ADMIN",
      },
      headers: new Headers(),
    });

    if (!response?.user) {
        throw new Error("Empty response from signUpUsername");
    }

    console.log("Admin user created successfully!");
    console.log("User ID:", response.user.id);
  } catch (error: any) {
    console.error("Failed to create admin user:", error?.message || error);
    if (error?.body) {
        console.error("Error body:", error.body);
    }
    process.exit(1);
  }
}

main().catch(console.error);
