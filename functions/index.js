/**
 * index.js - Cloud Functions
 * Versão Atualizada com Gestão de Fuso Horário por UF da Unidade
 */

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { defineJsonSecret } = require("firebase-functions/params");

admin.initializeApp();
const db = admin.firestore();

const emailConfig = defineJsonSecret("EMAIL_CONFIG");

let mailTransport = null;

// ==================================================================
// 0. CONSTANTES DE FUSO HORÁRIO
// ==================================================================
const TIMEZONES_BR = {
    'AC': 'America/Rio_Branco',
    'AL': 'America/Sao_Paulo',
    'AP': 'America/Sao_Paulo',
    'AM': 'America/Manaus',
    'BA': 'America/Sao_Paulo',
    'CE': 'America/Sao_Paulo',
    'DF': 'America/Sao_Paulo',
    'ES': 'America/Sao_Paulo',
    'GO': 'America/Sao_Paulo',
    'MA': 'America/Sao_Paulo',
    'MT': 'America/Cuiaba',      
    'MS': 'America/Campo_Grande',
    'MG': 'America/Sao_Paulo',
    'PA': 'America/Belem',
    'PB': 'America/Sao_Paulo',
    'PR': 'America/Sao_Paulo',
    'PE': 'America/Sao_Paulo',
    'PI': 'America/Sao_Paulo',
    'RJ': 'America/Sao_Paulo',
    'RN': 'America/Sao_Paulo',
    'RS': 'America/Sao_Paulo',
    'RO': 'America/Porto_Velho',
    'RR': 'America/Boa_Vista',
    'SC': 'America/Sao_Paulo',
    'SP': 'America/Sao_Paulo',
    'SE': 'America/Sao_Paulo',
    'TO': 'America/Sao_Paulo'
};

const getFusoPorUF = (uf) => {
    if (!uf) return 'America/Sao_Paulo';
    return TIMEZONES_BR[uf.toUpperCase().trim()] || 'America/Sao_Paulo';
};

// ==================================================================
// HELPER: Inicializador do Transporter 
// ==================================================================
function getTransporter() {
  if (mailTransport) return mailTransport;

  mailTransport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: emailConfig.value().user || "cloudtempmonitor@gmail.com",
      pass: emailConfig.value().pass,
    },
  });
  return mailTransport;
}

// ==================================================================
// 1. HELPER: Buscar Tokens
// ==================================================================
async function getEligibleTokens(macAddress) {
    logger.info(`🔍 BUSCA PUSH: Procurando usuários para MAC: '${macAddress}'`);
    const tokens = [];
    try {
        const usersSnapshot = await db.collection('usuarios') 
            .where('ativo', '==', true)
            .where('acessoDispositivos', 'array-contains', macAddress)
            .get();

        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.alarmePush === true) {
                if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                    userData.fcmTokens.forEach(token => {
                        if (token) tokens.push(token);
                    });
                }
            }
        });
        return [...new Set(tokens)];
    } catch (error) {
        logger.error("❌ ERRO BUSCA TOKENS:", error);
        return [];
    }
}

// ==================================================================
// 1B. HELPER: Buscar E-mails Elegíveis
// ==================================================================
async function getEligibleEmails(macAddress) {
    logger.info(`🔍 BUSCA EMAILS: Procurando usuários para MAC: '${macAddress}'`);
    const emails = [];
    try {
        const usersSnapshot = await db.collection('usuarios') 
            .where('ativo', '==', true)
            .where('acessoDispositivos', 'array-contains', macAddress)
            .get();

        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            // FILTRO: Verifica se o usuário quer receber E-MAIL
            if (userData.alarmeEmail === true && userData.email) {
                emails.push(userData.email);
            }
        });
        return [...new Set(emails)];
    } catch (error) {
        logger.error("❌ ERRO BUSCA EMAILS:", error);
        return [];
    }
}

// ==================================================================
// 2. HELPER: Enviar Notificação FCM
// ==================================================================
async function sendNotification(tokens, title, body, data = {}) {
  if (tokens.length === 0) return;

  const message = {
    data: {
      titulo: title,
      mensagem: body,
      ...data,
      timestamp: Date.now().toString(),
      icon: "/templogger/img/icon-192.png",
    },
    tokens,
    android: { priority: "high", ttl: 3600 * 1000 },
    apns: {
      headers: { "apns-priority": "10" },
      payload: { aps: { sound: "default", badge: 1 } },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    logger.info(`✅ FCM Enviado: ${response.successCount} sucessos.`);
  } catch (error) {
    logger.error("❌ ERRO NO FCM:", error);
  }
}

// ==================================================================
// 2B. HELPER: Enviar E-mails 
// ==================================================================
async function sendEmails(emails, subject, textBody, htmlBody) {
  if (emails.length === 0) {
    logger.warn("⚠️ ENVIO DE E-MAIL ABORTADO: Lista vazia.");
    return;
  }

  const transport = getTransporter();

  const promessasEnvio = emails.map(async (email) => {
    const mailOptions = {
      from: `Cloud Monitor <${emailConfig.value().user || "noreply@monitor.com"}>`,
      to: email,
      subject: subject,
      text: textBody,
      html: htmlBody,
    };

    try {
      await transport.sendMail(mailOptions);
      logger.info(`✅ E-mail enviado para ${email}`);
    } catch (error) {
      logger.error(`❌ Erro ao enviar e-mail para ${email}:`, error);
    }
  });

  await Promise.all(promessasEnvio);
}

// ==================================================================
// 5. GATILHO: Alarmes
// ==================================================================
exports.onAlarmChange = onDocumentWritten(
  {
    document: "dispositivos/{mac}/eventos/estadoAlarmeAtual",
    secrets: [emailConfig], 
  },
  async (event) => {
    const mac = event.params.mac;

    const rawBefore = event.data.before.exists ? event.data.before.data() : {};
    const rawAfter = event.data.after.exists ? event.data.after.data() : {};

    const beforeData = rawBefore.estadoAlarmeAtual || rawBefore;
    const afterData = rawAfter.estadoAlarmeAtual || rawAfter;

    const wasActive = beforeData.ativo === true;
    const isActive = afterData.ativo === true;

    logger.info(`🔔 GATILHO: MAC=${mac} | Estado: ${wasActive} -> ${isActive}`);

    if (wasActive === isActive) return;

    // 1. Busca dados do DISPOSITIVO
    const deviceSnap = await db.collection("dispositivos").doc(mac).get();
    if (!deviceSnap.exists) {
      logger.error("❌ Dispositivo não encontrado.");
      return;
    }

    const devData = deviceSnap.data();
    const nomeDisp = devData.nomeDispositivo || "Dispositivo";
    const nomeUnidade = devData.nomeUnidade || "Unidade";
    const nomeSetor = devData.nomeSetor || "Setor";

    // -------------------------------------------------------------
    // LÓGICA DE FUSO HORÁRIO AUTOMÁTICO (Baseado na UF da Unidade)
    // -------------------------------------------------------------
    let timeZoneCalculado = 'America/Sao_Paulo'; // Default

    logger.info(`📍 DADOS DO DISPOSITIVO ${mac}:`, {
    nomeDispositivo: devData.nomeDispositivo,
    unidadeID: devData.unidadeID,
    nomeUnidade: devData.nomeUnidade,
    timeZone: devData.timeZone,
    todosCampos: Object.keys(devData) 
});



   if (devData.unidadeID) {
    try {
        // Referência CORRETA à coleção "unidades"
        const unitRef = db.collection("unidades").doc(devData.unidadeID);
        logger.info(`📍 Buscando unidade com ID: ${devData.unidadeID}`);
        
        const unitSnap = await unitRef.get();
        
        if (unitSnap.exists) {
            const unitData = unitSnap.data();
            logger.info(`📍 DADOS DA UNIDADE encontrados:`, unitData);
            
            // VERIFICAÇÃO EXPLÍCITA do campo uf
            if (unitData.uf) {
                const uf = unitData.uf.trim().toUpperCase();
                logger.info(`📍 UF encontrada: "${uf}"`);
                
                timeZoneCalculado = getFusoPorUF(uf);
                logger.info(`📍 Fuso calculado: ${uf} -> ${timeZoneCalculado}`);
            } else {
                logger.warn(`📍 Unidade encontrada MAS SEM CAMPO 'uf'. Campos disponíveis:`, Object.keys(unitData));
            }
        } else {
            logger.warn(`📍 Unidade com ID "${devData.unidadeID}" NÃO EXISTE no Firestore.`);
        }
    } catch (err) {
        logger.error(`📍 ERRO ao buscar unidade ${devData.unidadeID}:`, err);
    }
} else {
    logger.warn(`📍 Dispositivo ${mac} NÃO tem campo 'unidadeID'.`);
    
    // Fallback: verificar se tem timeZone direto
    if (devData.timeZone) {
        timeZoneCalculado = devData.timeZone;
        logger.info(`📍 Usando timeZone direto do dispositivo: ${timeZoneCalculado}`);
    }
}
    
    logger.info(`📍 Fuso horário definido para ${mac}: ${timeZoneCalculado}`);
    // -------------------------------------------------------------

    // INÍCIO DE ALARME
    if (!wasActive && isActive) {
      const tipoAlarme = afterData.tipo || "Alarme Genérico";
      const idEvento = afterData.idEvento || "";

      const [tokens, emails] = await Promise.all([
        getEligibleTokens(mac),
        getEligibleEmails(mac),
      ]);

      await sendNotification(
        tokens,
        `🚨 Alerta: ${nomeDisp}`,
        `${nomeUnidade} - ${nomeSetor}\nMotivo: ${tipoAlarme}`,
        { mac, type: "alarm_start", alarmType: tipoAlarme, eventId: idEvento },
      );

      let leiturasParaEmail = {
        sonda: "--",
        ambiente: "--",
        umidade: "--",
        statusSonda: "Normal",
      };

      if (idEvento) {
        const eventSnap = await db
          .collection(`dispositivos/${mac}/eventos`)
          .doc(idEvento)
          .get();
        if (eventSnap.exists) {
          const ev = eventSnap.data();
          const readings = ev.startReading || {};

          leiturasParaEmail = {
            sonda: readings.temperatura,
            ambiente: readings.temperaturaAmbiente,
            umidade: readings.umidade,
            statusSonda: readings.alarmeSonda ? "CRÍTICO" : "Normal",
          };
        }
      }

      const dadosEmail = {
        unidade: nomeUnidade,
        setor: nomeSetor,
        dispositivo: nomeDisp,
        motivo: tipoAlarme,
        leituras: leiturasParaEmail,
        startTime: admin.firestore.Timestamp.now(),
        timeZone: timeZoneCalculado 
      };

      const htmlBody = generateEmailHtml("ALARM_START", dadosEmail);
      const textBody = `ALERTA: ${nomeDisp} no setor ${nomeSetor}. Motivo: ${tipoAlarme}. Sonda: ${leiturasParaEmail.sonda}°C`;

      await sendEmails(
        emails,
        `[ALERTA] ${nomeDisp} - ${nomeSetor}`,
        textBody,
        htmlBody,
      );
    }

    // FIM DE ALARME (Normalização)
    else if (wasActive && !isActive) {
      const tipoAnterior = beforeData.tipo || "Alarme Desconhecido";
      const idEvento = beforeData.idEvento || "";
      let dataInicioEvento = admin.firestore.Timestamp.now();
      
      const [tokens, emails] = await Promise.all([
        getEligibleTokens(mac),
        getEligibleEmails(mac),
      ]);

      await sendNotification(
        tokens,
        `✅ Normalizado: ${nomeDisp}`,
        `${nomeUnidade} - ${nomeSetor}\nO parâmetro ${tipoAnterior} retornou aos níveis aceitáveis.`,
        { mac, type: "alarm_end", lastAlarmType: tipoAnterior },
      );

      // --- PREPARAÇÃO DOS DADOS ---
      let leiturasParaEmail = {
        sonda: undefined,
        ambiente: undefined,
        umidade: undefined,
      };
      let duracaoTexto = "Não calculada";

      if (idEvento) {
        const eventSnap = await db
          .collection(`dispositivos/${mac}/eventos`)
          .doc(idEvento)
          .get();

        if (eventSnap.exists) {
          const ev = eventSnap.data();

          // Pega endReading
          const readings = ev.endReading || {};
          leiturasParaEmail = {
            sonda: readings.temperatura,
            ambiente: readings.temperaturaAmbiente,
            umidade: readings.umidade,
          };

          // CÁLCULO DA DURAÇÃO 
          if (ev.startTime) {
            const inicio = ev.startTime.toDate();
            const fim = ev.endTime ? ev.endTime.toDate() : new Date();

            const diffMs = fim - inicio; 
            const diffMins = Math.floor(diffMs / 60000); 

            const horas = Math.floor(diffMins / 60);
            const minutos = diffMins % 60;

            if (horas > 0) {
              duracaoTexto = `${horas}h ${minutos}min`;
            } else {
              duracaoTexto = `${minutos} minutos`;
            }
            
            // Define data real de início para o email
            dataInicioEvento = ev.startTime; 
          }
        }
      }

      const dadosEmail = {
        unidade: nomeUnidade,
        setor: nomeSetor,
        dispositivo: nomeDisp,
        motivo: tipoAnterior,
        duracao: duracaoTexto, 
        leituras: leiturasParaEmail,
        startTime: dataInicioEvento,
        timeZone: timeZoneCalculado 
      };

      const htmlBody = generateEmailHtml("ALARM_END", dadosEmail);
      const textBody = `NORMALIZADO: ${nomeDisp}. Duração: ${duracaoTexto}. Leitura atual: ${leiturasParaEmail.sonda || "?"}°C`;

      await sendEmails(emails, `[NORMALIZADO] ${nomeDisp}`, textBody, htmlBody);
    }
  },
);

// ==================================================================
// HELPER: Gerador de Template HTML 
// ==================================================================
function generateEmailHtml(tipo, dados) {
    const isAlarm = tipo === 'ALARM_START';
    
    const fmt = (val) => {
        if (val === undefined || val === null || val === '') return '--';
        return Number(val).toFixed(2);
    };

    const triggersArray = (dados.disparadoPor && Array.isArray(dados.disparadoPor)) ? dados.disparadoPor.join(' ') : '';
    const motivoTexto = dados.motivo || '';
    const textoAnalise = (triggersArray + ' ' + motivoTexto).toLowerCase();
    
    let tituloBanner = isAlarm ? '🚨 ALERTA DO SISTEMA' : '✅ SISTEMA NORMALIZADO';
    
    if (isAlarm) {
        if (textoAnalise.includes('umidade') || textoAnalise.includes('umi')) {
            tituloBanner = '🚨 ALERTA DE UMIDADE';
        } else if (textoAnalise.includes('temp') || textoAnalise.includes('sonda')) {
            tituloBanner = '🚨 ALERTA DE TEMPERATURA';
        }
    }

    const color = isAlarm ? '#d32f2f' : '#2e7d32'; 
    const bgColor = isAlarm ? '#fdecea' : '#e8f5e9';
    const msgPrincipal = isAlarm 
        ? 'O sistema detectou um desvio crítico nos seguintes parâmetros:'
        : 'O monitoramento indicou que os parâmetros voltaram à normalidade.';
    const labelColunaValor = isAlarm ? 'Leitura de Disparo' : 'Leitura Final';
    
    // Tratamento de Data Seguro
    let dataDoEvento;
    const rawDate = dados.startTime;
    if (rawDate && typeof rawDate.toDate === 'function') {
        dataDoEvento = rawDate.toDate(); 
    } 
    else if (rawDate) {
        dataDoEvento = new Date(rawDate);
    } 
    else {
        dataDoEvento = new Date();
    }

    // Tratamento de Fuso
    const fusoDoUsuario = dados.timeZone || 'America/Sao_Paulo';
    
    const dataHora = dataDoEvento.toLocaleString('pt-BR', {
         timeZone: fusoDoUsuario,
         day: '2-digit', month: '2-digit', year: 'numeric',
         hour: '2-digit', minute: '2-digit'
    });

    let duracaoHtml = '';
    if (!isAlarm && dados.duracao) {
        duracaoHtml = `<p style="margin: 5px 0;"><strong>⏱️ Duração do Incidente:</strong> ${dados.duracao}</p>`;
    }

    let rows = '';
    
    if (dados.leituras.sonda !== undefined && dados.leituras.sonda !== null) {
        rows += `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">🌡️ Sonda Principal</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${fmt(dados.leituras.sonda)}°C</td>
        </tr>`;
    }

    if (dados.leituras.ambiente !== undefined && dados.leituras.ambiente !== null) {
        rows += `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">🏠 Ambiente</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${fmt(dados.leituras.ambiente)}°C</td>
        </tr>`;
    }

    if (dados.leituras.umidade !== undefined && dados.leituras.umidade !== null) {
        rows += `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">💧 Umidade</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${fmt(dados.leituras.umidade)}%</td>
        </tr>`;
    }

    let tabelaHtml = '';
    if (rows) {
        tabelaHtml = `
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;">
                <tr style="background-color: #f5f5f5; text-align: left;">
                    <th style="padding: 8px; border-bottom: 1px solid #ddd;">Parâmetro</th>
                    <th style="padding: 8px; border-bottom: 1px solid #ddd;">${labelColunaValor}</th>
                </tr>
                ${rows}
            </table>
        `;
    }

    return `
    <!DOCTYPE html>
    <html>
    <body style="font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; margin-top: 20px; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <tr>
                <td align="center" style="padding: 25px 0; background-color: ${color}; color: #ffffff;">
                    <h1 style="margin: 0; font-size: 24px; text-transform: uppercase;">${tituloBanner}</h1>
                </td>
            </tr>
            <tr>
                <td style="padding: 30px;">
                    <p style="font-size: 16px; color: #333;">${msgPrincipal}</p>
                    
                    <div style="background-color: ${bgColor}; border-left: 5px solid ${color}; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 5px 0;"><strong>🏢 Local:</strong> ${dados.unidade} - ${dados.setor}</p>
                        <p style="margin: 5px 0;"><strong>📟 Dispositivo:</strong> ${dados.dispositivo}</p>
                        <p style="margin: 5px 0;"><strong>⚠️ Detalhe:</strong> ${dados.motivo}</p>
                        ${duracaoHtml}
                        <p style="margin: 5px 0;"><strong>🕒 Data/Hora:</strong> ${dataHora}</p>
                    </div>

                    ${tabelaHtml}

                    <div style="text-align: center; margin-top: 30px;">
                        <a href="https://cloudtempmonitor.github.io/templogger/" style="background-color: ${color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Acessar Painel</a>
                    </div>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
}