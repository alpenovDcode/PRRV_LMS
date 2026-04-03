# Claude Account Reset

To unlink your Claude account and authenticate with a new one, you can follow these steps:

## For Claude Code (CLI)

If you are using the `claude` command-line tool, you should use the built-in commands:

1. **Logout**:
   ```bash
   claude logout
   ```
2. **Login**:
   ```bash
   claude login
   ```
   This will open a browser window for you to authorize the new account.

## For Claude Desktop App

If you are using the desktop application:
1. Open the Claude app.
2. Click on your profile name/icon in the bottom left corner.
3. Select **Sign Out**.

## Manual Reset (Advanced)

If the commands above don't work or you want to clear all data manually on your Mac:

1. **Remove Claude Code configuration**:
   ```bash
   rm -rf ~/.claude
   rm -rf "~/Library/Application Support/Claude/claude-code*"
   ```
2. **Clear Claude Desktop preferences**:
   ```bash
   rm -rf "~/Library/Application Support/Claude"
   defaults delete com.anthropic.claudefordesktop
   ```

> [!WARNING]
> Manual removal will delete your settings, history, and active sessions. Make sure you have backed up anything important.
