/**
 * RENTAL GATE CRM — Authentication & Session Management
 */
(function (root) {
  'use strict';

  var currentUser = null;

  function getUser() {
    return currentUser;
  }

  function setUser(user) {
    currentUser = user;
  }

  async function restoreSession() {
    var token = root.RGApi.getToken();
    if (!token) return null;
    try {
      var res = await root.RGApi.callApi('getMe', {});
      if (res && res.success && res.data && res.data.user) {
        currentUser = res.data.user;
        return currentUser;
      }
    } catch (e) {}
    root.RGApi.setToken('');
    currentUser = null;
    return null;
  }

  async function login(username, password) {
    var cleanUser = String(username || '').trim();
    var cleanPass = String(password || '');
    if (!cleanUser || !cleanPass) {
      return {
        success: false,
        message: 'يرجى إدخال اسم المستخدم وكلمة المرور.',
        data: null,
        error: 'VALIDATION'
      };
    }
    try {
      var res = await root.RGApi.callApi('login', { username: cleanUser, password: cleanPass });
      if (res && res.success && res.data && res.data.token && res.data.user) {
        root.RGApi.setToken(res.data.token);
        currentUser = res.data.user;
      }
      return res || { success: false, message: 'تعذر إتمام تسجيل الدخول.' };
    } catch (err) {
      return {
        success: false,
        message: 'حدث خطأ أثناء تسجيل الدخول: ' + (err && err.message ? err.message : err),
        data: null,
        error: 'LOGIN_EXCEPTION'
      };
    }
  }

  async function logout() {
    try {
      if (root.RGApi.getToken()) {
        await root.RGApi.callApi('logout', {});
      }
    } catch (e) {}
    root.RGApi.setToken('');
    currentUser = null;
  }

  root.RGAuth = {
    getUser: getUser,
    setUser: setUser,
    restoreSession: restoreSession,
    login: login,
    logout: logout
  };
})(window);
