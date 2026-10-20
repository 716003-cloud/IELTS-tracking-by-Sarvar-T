#!/usr/bin/env bash
# Creates a release signing key. KEEP THE .jks FILE AND PASSWORDS SAFE: without the same key you cannot update an installed app.
set -e
keytool -genkeypair -v -keystore release.jks -alias ielts -keyalg RSA -keysize 2048 -validity 10000
echo "Now create android/keystore.properties:"
echo "  storeFile=../release.jks"
echo "  storePassword=..."
echo "  keyAlias=ielts"
echo "  keyPassword=..."
