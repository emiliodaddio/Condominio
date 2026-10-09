const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

server = server.replace("const { email, password } = req.body;", "const { email, password } = req.body;\n    console.log('LOGIN ATTEMPT:', email);");
server = server.replace("const { userId, otp } = req.body;", "const { userId, otp } = req.body;\n    console.log('OTP VERIFY ATTEMPT:', userId, otp);");

fs.writeFileSync('server.js', server);
console.log('Added login logs to server.js');
