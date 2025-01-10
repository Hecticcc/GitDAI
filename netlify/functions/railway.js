@@ .. @@
     const response = await fetch(url, {
@@ .. @@
-    const response = {
+    const result = {
       statusCode: 200,
       headers: {
         'Content-Type': 'application/json',
@@ .. @@
       })
     };
 
-    return response;
+    return result;
@@ .. @@
-exports.handler = handler;
+export { handler };