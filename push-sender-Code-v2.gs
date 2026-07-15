/**
 * FSE eIRN — Push Notification Sender (Apps Script) — v2 with urgent repeat
 * ==========================================================================
 * Receives {tokens, title, body, url, repeat, intervalSec, msgId, senderCode}
 * from the eIRN app. Sends the push, and for urgent requests (repeat > 1)
 * resends up to `repeat` times, ~intervalSec apart, STOPPING EARLY if the
 * linked message has been read by anyone other than the sender.
 *
 * UPDATE INSTRUCTIONS (existing project):
 * 1. Open your "FSE Push Sender" project at script.google.com
 * 2. Select ALL the old code and replace it with this file
 * 3. Re-paste your two secret values into SA_CLIENT_EMAIL and SA_PRIVATE_KEY
 *    (same values as before, from the Firebase JSON file)
 * 4. Save, then: Deploy > Manage deployments > pencil icon (Edit)
 *    > Version: "New version" > Deploy.  (This keeps the SAME URL —
 *    nothing changes in index.html.)
 */

var SA_CLIENT_EMAIL = 'PASTE_client_email_FROM_JSON_HERE';
var SA_PRIVATE_KEY = 'PASTE_private_key_FROM_JSON_HERE';
var FCM_PROJECT_ID = 'fse-irn-system';

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var tokens = req.tokens || [];
    var title = String(req.title || 'FSE eIRN').substring(0, 200);
    var body = String(req.body || '').substring(0, 400);
    var url = String(req.url || '');
    var repeat = Math.min(parseInt(req.repeat) || 1, 3);
    var intervalSec = Math.min(Math.max(parseInt(req.intervalSec) || 25, 10), 60);
    var msgId = String(req.msgId || '');
    var senderCode = String(req.senderCode || '').toUpperCase();
    if (tokens.length === 0) return _json({ ok: false, error: 'no tokens' });
    if (tokens.length > 500) tokens = tokens.slice(0, 500);

    var accessToken = getFcmAccessToken_();
    var totalSent = 0;

    for (var round = 1; round <= repeat; round++) {
      if (round > 1) {
        Utilities.sleep(intervalSec * 1000);
        // Stop repeating if someone (other than the sender) has read the message
        if (msgId && messageWasRead_(msgId, senderCode, accessToken)) break;
      }
      var roundTitle = round > 1 ? title + ' (reminder ' + round + ')' : title;
      totalSent += sendRound_(tokens, roundTitle, body, url, accessToken);
    }

    return _json({ ok: true, sent: totalSent });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function sendRound_(tokens, title, body, url, accessToken) {
  var sent = 0;
  tokens.forEach(function (t) {
    var payload = {
      message: {
        token: t,
        data: { title: title, body: body, url: url, tag: String(Date.now()) + Math.floor(Math.random() * 1000) },
        android: { priority: 'high' },
        webpush: { headers: { Urgency: 'high', TTL: '86400' } }
      }
    };
    var resp = UrlFetchApp.fetch(
      'https://fcm.googleapis.com/v1/projects/' + FCM_PROJECT_ID + '/messages:send',
      {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + accessToken },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );
    if (resp.getResponseCode() === 200) sent++;
  });
  return sent;
}

/** Checks Firestore: has anyone other than the sender read this message? */
function messageWasRead_(msgId, senderCode, accessToken) {
  try {
    var resp = UrlFetchApp.fetch(
      'https://firestore.googleapis.com/v1/projects/' + FCM_PROJECT_ID +
      '/databases/(default)/documents/messages/' + encodeURIComponent(msgId),
      { headers: { Authorization: 'Bearer ' + accessToken }, muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) return false;
    var docData = JSON.parse(resp.getContentText());
    var vals = ((((docData.fields || {}).readBy || {}).arrayValue || {}).values) || [];
    for (var i = 0; i < vals.length; i++) {
      var code = String(vals[i].stringValue || '').toUpperCase();
      if (code && code !== senderCode) return true;
    }
    return false;
  } catch (err) {
    return false;
  }
}

/** Exchange the service account key for a short-lived OAuth token (cached ~50 min) */
function getFcmAccessToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('fcm_token_v2');
  if (cached) return cached;

  var now = Math.floor(Date.now() / 1000);
  var header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var claims = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss: SA_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  var toSign = header + '.' + claims;
  var key = SA_PRIVATE_KEY.replace(/\\n/g, '\n');
  var signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(toSign, key)
  );
  var jwt = toSign + '.' + signature;

  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    },
    muteHttpExceptions: true
  });
  var data = JSON.parse(resp.getContentText());
  if (!data.access_token) throw new Error('Token exchange failed: ' + resp.getContentText());
  cache.put('fcm_token_v2', data.access_token, 3000);
  return data.access_token;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to verify the service account works */
function testAuth() {
  Logger.log(getFcmAccessToken_().substring(0, 20) + '...');
}
