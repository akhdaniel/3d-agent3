kill $(lsof -t -nP -iTCP:5173 -sTCP:LISTEN)
nohup yarn dev > /tmp/frontend.log 2>&1 &