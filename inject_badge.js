const fs = require('fs');
let c = fs.readFileSync('c:/classificado/js/main.js', 'utf8');

const injection = `
        const avatar = document.createElement('div');
        
        // -- Notificação Global de Mensagens --
        if (window.getMyMessages) {
          getMyMessages().then(msgs => {
            if(!msgs || !msgs.length) return;
            let uid = localStorage.getItem('tc_user_id');
            if(!uid) return;
            let convs = {};
            msgs.forEach(m => {
              let otherId = (m.sender_id === uid) ? m.receiver_id : m.sender_id;
              let key = m.ad_id + '_' + otherId;
              if(!convs[key]) convs[key] = [];
              convs[key].push(m);
            });
            let unread = 0;
            Object.values(convs).forEach(arr => {
               arr.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
               if(arr[arr.length-1].sender_id !== uid) unread++;
            });
            if (unread > 0) {
              msgBadge.textContent = unread;
              msgBadge.style.display = 'flex';
            }
          }).catch(()=>{});
        }
`;

c = c.replace(/const avatar = document\.createElement\('div'\);/, injection);
fs.writeFileSync('c:/classificado/js/main.js', c, 'utf8');
