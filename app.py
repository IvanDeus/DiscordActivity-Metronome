import logging
import traceback
from flask import Flask, render_template, request, jsonify, g
from app_cfg import DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DEBUG, APP_LPORT, LOGFPATH, DATABASE
import json
import sqlite3
import os
import sys
import requests

app = Flask(__name__)
app.config['TEMPLATES_AUTO_RELOAD'] = True

def get_db():
    if not hasattr(g, '_sqlite_db'):
        g._sqlite_db = sqlite3.connect(DATABASE)
        g._sqlite_db.row_factory = sqlite3.Row
    return g._sqlite_db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_sqlite_db', None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        db = get_db()
        with app.open_resource('schema.sql', mode='r') as f:
            db.cursor().executescript(f.read())
        db.commit()

@app.route('/')
def index():
    return render_template('load.html', client_id=DISCORD_CLIENT_ID)

@app.route('/api/token', methods=['POST'])
def get_discord_token():
    try:
        data = request.json
        code = data.get('code')
        if not code:
            return jsonify({"error": "Missing code"}), 400

        # Exchange code for access token
        token_response = requests.post(
            'https://discord.com/api/oauth2/token',
            data={
                'client_id': DISCORD_CLIENT_ID,
                'client_secret': DISCORD_CLIENT_SECRET,
                'grant_type': 'authorization_code',
                'code': code,
            },
            headers={'Content-Type': 'application/x-www-form-urlencoded'}
        )

        token_data = token_response.json()
        if not token_response.ok:
            app.logger.error(f"Failed to get token: {token_data}")
            return jsonify({"error": "Failed to exchange token"}), 400

        access_token = token_data.get('access_token')

        # We can also fetch user data if needed to store in DB
        user_response = requests.get(
            'https://discord.com/api/users/@me',
            headers={'Authorization': f'Bearer {access_token}'}
        )

        if user_response.ok:
            user_data = user_response.json()
            user_id = user_data.get('id')
            username = user_data.get('username')
            global_name = user_data.get('global_name', '')
            avatar = user_data.get('avatar', '')
            locale = user_data.get('locale', 'en')

            db = get_db()
            cur = db.cursor()
            cur.execute("SELECT * FROM discord_users WHERE user_id = ?", (user_id,))
            existing_user = cur.fetchone()
            if not existing_user:
                cur.execute("""
                    INSERT INTO discord_users (
                        user_id, username, global_name, avatar, locale, bpm
                    ) VALUES (?, ?, ?, ?, ?, ?)
                """, (user_id, username, global_name, avatar, locale, 90))
            else:
                cur.execute("""
                    UPDATE discord_users SET
                        username = ?, global_name = ?, avatar = ?
                    WHERE user_id = ?
                """, (username, global_name, avatar, user_id))
            db.commit()

        # Send token back to client so they can authenticate the embedded SDK
        return jsonify(token_data)

    except Exception as e:
        app.logger.error(f"Error getting discord token: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/user', methods=['GET'])
def get_user_prefs():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"error": "Missing user_id"}), 400

    try:
        db = get_db()
        cur = db.cursor()
        cur.execute("SELECT * FROM discord_users WHERE user_id = ?", (user_id,))
        user = cur.fetchone()

        if user:
            return jsonify(dict(user))
        return jsonify({"error": "User not found"}), 404
    except Exception as e:
        app.logger.error(f"Error fetching user prefs: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/update_user_prefs', methods=['POST'])
def update_user_prefs():
    user_id = request.form.get('user_id')
    bpm = request.form.get('bpm')
    if not user_id or not bpm:
        return jsonify({"error": "Missing user_id or bpm"}), 400
    try:
        bpm = int(bpm)
    except ValueError:
        return jsonify({"error": "Invalid bpm format"}), 400

    db = get_db()
    cur = db.cursor()
    try:
        cur.execute(
            "UPDATE discord_users SET bpm = ? WHERE user_id = ?",
            (bpm, user_id)
        )
        db.commit()
        return jsonify({"success": True}), 200
    except Exception as e:
        app.logger.error(f"Error in update_user_prefs: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

if __name__ == '__main__':
    if not os.path.exists(DATABASE):
        with app.app_context():
            init_db()
    logging.basicConfig(level=logging.DEBUG,format='%(asctime)s %(levelname)s: %(message)s',handlers=[logging.StreamHandler(sys.stdout)])
    app.run(host='127.0.0.1', port=APP_LPORT, debug=DEBUG)
