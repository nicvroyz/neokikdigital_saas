<?php
// Based on mailcow-dockerized's data/web/sogo-auth.php (upstream, unmodified logic
// preserved verbatim below). The ONLY addition is the `neokik_token` branch, which
// lets Neokik's backend grant a passwordless SOGo session for one mailbox, without
// needing a live Mailcow admin UI session (which is what the native `?login=`
// branch below requires) and without ever handling the mailbox's real password.
//
// Deploy: bind-mount this file over /web/sogo-auth.php in the php-fpm-mailcow
// container (see docker-compose.override.yml.example in this folder) and set
// NEOKIK_WEBMAIL_SSO_SECRET in mailcow.conf to the SAME value as Neokik's
// WEBMAIL_SSO_SECRET. See docs/WEBMAIL_SSO.md for the full walkthrough and the
// manual test to run after deploying.
//
// Re-diff this file against upstream after every `mailcow update` — nothing here
// should conflict, but upstream could change the surrounding logic.

$ALLOW_ADMIN_EMAIL_LOGIN = (preg_match(
  "/^([yY][eE][sS]|[yY])+$/",
  $_ENV["ALLOW_ADMIN_EMAIL_LOGIN"]
));

$session_var_user_allowed = 'sogo-sso-user-allowed';
$session_var_pass = 'sogo-sso-pass';

// only the internal nginx auth_request loopback (127.0.0.1:65510) sets this;
// external clients can never supply it (bare fastcgi param, not an HTTP header)
$is_internal_auth = (($_SERVER['SOGO_AUTH_INTERNAL'] ?? '') === '1');

// validate credentials for basic auth requests
if ($is_internal_auth && isset($_SERVER['PHP_AUTH_USER'])) {
  // load prerequisites only when required
  require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/prerequisites.inc.php';

  $username = $_SERVER['PHP_AUTH_USER'];
  $password = $_SERVER['PHP_AUTH_PW'];

  // Determine service type for protocol access check
  $service = 'NONE';
  $original_uri = isset($_SERVER['HTTP_X_ORIGINAL_URI']) ? $_SERVER['HTTP_X_ORIGINAL_URI'] : '';
  if (preg_match('/^(\/SOGo|)\/dav.*/', $original_uri) === 1) {
    $service = 'DAV';
  }
  elseif (preg_match('/^(\/SOGo|)\/Microsoft-Server-ActiveSync.*/', $original_uri) === 1) {
    $service = 'EAS';
  }

  $login_check = check_login($username, $password, array('service' => $service));
  if ($login_check === 'user') {
    header("X-User: $username");
    header("X-Auth: Basic ".base64_encode("$username:$password"));
    header("X-Auth-Type: Basic");
    exit;
  } else {
    header('HTTP/1.0 401 Unauthorized');
    echo 'Invalid login';
    exit;
  }
}
// ─── NEOKIK ADDITION START ──────────────────────────────────────────────────
// External, one-time, HMAC-signed token from the Neokik SaaS backend. Structurally
// mirrors the native `?login=` branch below (same session variable, same sasl_log
// table, same redirect target) — it just replaces "is there a live mailcow admin
// session with login_as ACL" with "is this a valid, unexpired, not-yet-used,
// correctly-signed token for this exact email".
elseif (isset($_GET['neokik_token'])) {
  require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/prerequisites.inc.php';

  $secret = $_ENV['NEOKIK_WEBMAIL_SSO_SECRET'] ?? '';
  $raw = $_GET['neokik_token'];
  $parts = explode('.', $raw, 2);

  if ($secret !== '' && count($parts) === 2) {
    list($payload_b64, $sig) = $parts;
    $expected_sig = hash_hmac('sha256', $payload_b64, $secret);

    if (hash_equals($expected_sig, $sig)) {
      $payload_json = base64_decode(strtr($payload_b64, '-_', '+/'));
      $payload = json_decode($payload_json, true);

      if (
        is_array($payload) &&
        !empty($payload['email']) &&
        !empty($payload['exp']) &&
        !empty($payload['jti']) &&
        (int)$payload['exp'] >= time() &&
        filter_var($payload['email'], FILTER_VALIDATE_EMAIL)
      ) {
        $login = $payload['email'];
        // strip anything but safe filename characters before using it as a path segment
        $jti = preg_replace('/[^a-zA-Z0-9_-]/', '', $payload['jti']);
        $used_dir = '/tmp/neokik-sso-used';
        $used_marker = $used_dir . '/' . $jti;

        // single-use: refuse if this token was already redeemed
        if ($jti !== '' && !file_exists($used_marker)) {
          // confirm the mailbox actually exists before granting a session for it
          if (user_get_alias_details($login) !== false) {
            if (!is_dir($used_dir)) {
              mkdir($used_dir, 0700, true);
            }
            file_put_contents($used_marker, (string)time());

            // register username in session, same as the native admin-login path
            $_SESSION[$session_var_user_allowed][] = $login;

            // update sasl logs (visible in mailcow's own UI, distinct service tag)
            $stmt = $pdo->prepare("REPLACE INTO sasl_log (`service`, `app_password`, `username`, `real_rip`) VALUES ('NEOKIK-SSO', 0, :username, :remote_addr)");
            $stmt->execute(array(
              ':username' => $login,
              ':remote_addr' => ($_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'])
            ));

            // redirect to sogo (sogo will get the correct credentials via nginx auth_request)
            header("Location: /SOGo/so/");
            exit;
          }
        }
      }
    }
  }

  // any failure (bad/expired/reused/unsigned token, unknown mailbox) -> just go home,
  // never leak *why* it failed to an unauthenticated caller
  header("Location: /");
  exit;
}
// ─── NEOKIK ADDITION END ────────────────────────────────────────────────────
// check permissions and redirect for direct GET ?login=xy requests
elseif (isset($_GET['login'])) {
  // load prerequisites only when required
  require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/prerequisites.inc.php';
  // check if dual_login is active
  $is_dual = (!empty($_SESSION["dual-login"]["username"])) ? true : false;
  // check permissions (if dual_login is active, deny sso when acl is not given)
  $login = html_entity_decode(rawurldecode($_GET["login"]));
  if (isset($_SESSION['mailcow_cc_role']) &&
    (($_SESSION['acl']['login_as'] == "1" && $ALLOW_ADMIN_EMAIL_LOGIN !== 0) || ($is_dual === false && $login == $_SESSION['mailcow_cc_username']))) {
    if (filter_var($login, FILTER_VALIDATE_EMAIL)) {
      if (user_get_alias_details($login) !== false) {
        // enforce tenant boundary
        if (!hasMailboxObjectAccess($_SESSION['mailcow_cc_username'], $_SESSION['mailcow_cc_role'], $login)) {
          header("Location: /");
          exit;
        }
        // Block SOGo access if pending actions (2FA setup, password update)
        if (!empty($_SESSION['pending_tfa_setup']) || !empty($_SESSION['pending_pw_update'])) {
          header("Location: /");
          exit;
        }
        // register username in session
        $_SESSION[$session_var_user_allowed][] = $login;
        // set dual login
        if ($_SESSION['acl']['login_as'] == "1" && $ALLOW_ADMIN_EMAIL_LOGIN !== 0 && $is_dual === false && $_SESSION['mailcow_cc_role'] != "user"){
          $_SESSION["dual-login"]["username"] = $_SESSION['mailcow_cc_username'];
          $_SESSION["dual-login"]["role"]     = $_SESSION['mailcow_cc_role'];
          $_SESSION['mailcow_cc_username']    = $login;
          $_SESSION['mailcow_cc_role']        = "user";
        }
        // update sasl logs
        $stmt = $pdo->prepare("REPLACE INTO sasl_log (`service`, `app_password`, `username`, `real_rip`) VALUES ('SSO', 0, :username, :remote_addr)");
        $stmt->execute(array(
          ':username' => $login,
          ':remote_addr' => ($_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'])
        ));
        // redirect to sogo (sogo will get the correct credentials via nginx auth_request
        header("Location: /SOGo/so/");
        exit;
      }
    }
  }
  header("Location: /");
  exit;
}
// only check for admin-login on sogo GUI requests
elseif ($is_internal_auth && isset($_SERVER['HTTP_X_ORIGINAL_URI']) && strcasecmp(substr($_SERVER['HTTP_X_ORIGINAL_URI'], 0, 9), "/SOGo/so/") === 0) {
  // this is an nginx auth_request call, we check for existing sogo-sso session variables
  require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/vars.inc.php';
  if (file_exists($_SERVER['DOCUMENT_ROOT'] . '/inc/vars.local.inc.php')) {
    include_once $_SERVER['DOCUMENT_ROOT'] . '/inc/vars.local.inc.php';
  }
  require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/sessions.inc.php';

  $email_list = array(
      ($_SESSION['mailcow_cc_username'] ?? ''),     // Current user
      ($_SESSION["dual-login"]["username"] ?? ''),  // Dual login user
  );
  foreach($email_list as $email) {
    // check if this email is in session allowed list
    if (
        !empty($email) &&
        filter_var($email, FILTER_VALIDATE_EMAIL) &&
        is_array($_SESSION[$session_var_user_allowed]) &&
        in_array($email, $_SESSION[$session_var_user_allowed]) &&
        !$_SESSION['pending_pw_update'] &&
        !$_SESSION['pending_tfa_setup']
    ) {
      $username = $email;
      $password = file_get_contents("/etc/sogo-sso/sogo-sso.pass");
      header("X-User: $username");
      header("X-Auth: Basic ".base64_encode("$username:$password"));
      header("X-Auth-Type: Basic");
      exit;
    }
  }
}

// if username is empty, SOGo will use the normal login methods / login form
header("X-User: ");
header("X-Auth: ");
header("X-Auth-Type: ");
