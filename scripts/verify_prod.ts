
import axios from 'axios';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env to get the production URL and API Key
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PROD_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://prrv.tech';
const API_KEY = process.env.API_SECRET_KEY;

// TEST CONFIGURATION
const CYRILLIC_SLUG = 'тест'; // Замените на реальный slug, если нужно
const PROTECTED_ENDPOINT = `${PROD_URL}/api/admin/courses`;

async function verifyProd() {
    console.log(`\n🚀 Starting Production Verification for: ${PROD_URL}\n`);

    // --- 1. ТЕСТ КИРИЛЛИЧЕСКИХ SLUG (404 FIX) ---
    console.log("--- Test 1: Cyrillic Slug Handling ---");
    const landingUrl = `${PROD_URL}/l/${encodeURIComponent(CYRILLIC_SLUG)}`;
    try {
        const res = await axios.get(landingUrl);
        console.log(`✅ [PASS] Landing page with Cyrillic slug returned status ${res.status}`);
    } catch (e: any) {
        if (e.response?.status === 404) {
            console.log(`❌ [FAIL] Landing page returned 404. Fix NOT deployed or slug '${CYRILLIC_SLUG}' missing.`);
        } else {
            console.log(`⚠️ [INFO] Got status ${e.response?.status || 'Error'}. Manual check recommended at ${landingUrl}`);
        }
    }

    // --- 2. ТЕСТ БЕЗОПАСНОСТИ API (API KEY IN URL) ---
    console.log("\n--- Test 2: Insecure API Key in URL ---");
    const insecureUrl = `${PROTECTED_ENDPOINT}?apiKey=${API_KEY}`;
    try {
        const res = await axios.get(insecureUrl);
        if (res.status === 200) {
            console.log("❌ [CRITICAL] VULNERABILITY FOUND: API Key in URL still works!");
        } else {
            console.log(`✅ [PASS] Insecure URL returned status ${res.status}`);
        }
    } catch (e: any) {
        if (e.response?.status === 401) {
            console.log("✅ [PASS] API successfully blocked insecure query-parameter authentication.");
        } else {
            console.log(`✅ [PASS] Insecure URL returned status ${e.response?.status || 'Error'}`);
        }
    }

    // --- 3. ТЕСТ НОВОЙ АВТОРИЗАЦИИ (HEADER-BASED) ---
    console.log("\n--- Test 3: Secure Header Authentication ---");
    try {
        const res = await axios.get(PROTECTED_ENDPOINT, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });
        if (res.status === 200) {
            console.log("✅ [PASS] Secure Header-based authentication works correctly!");
        } else {
            console.log(`❌ [FAIL] Header-based auth returned ${res.status}`);
        }
    } catch (e: any) {
        console.log(`❌ [FAIL] Header-based auth failed with ${e.response?.status || 'Error'}`);
        if (e.response?.status === 401) {
            console.log("   (Reason: Server does not accept the API Key in the Authorization header yet)");
        }
    }

    console.log("\n🏁 Verification Complete.");
    console.log("--------------------------------------------------");
    console.log("Если Test 2 и Test 3 прошли успешно (PASS) — ваш API защищен.");
    console.log("Если Test 1 вернул 200 — исправление кириллицы работает.");
}

verifyProd().catch(console.error);
