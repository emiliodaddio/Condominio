-- MySQL dump 10.13  Distrib 8.4.9, for Win64 (x86_64)
--
-- Host: localhost    Database: condominio_db
-- ------------------------------------------------------
-- Server version	8.4.9

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `anagrafica_persone`
--

DROP TABLE IF EXISTS `anagrafica_persone`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `anagrafica_persone` (
  `id` int NOT NULL AUTO_INCREMENT,
  `condominio_id` int NOT NULL,
  `nome` varchar(255) NOT NULL,
  `cognome` varchar(255) NOT NULL,
  `codice_fiscale` varchar(50) DEFAULT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  `cellulare` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `ruolo_default` varchar(50) DEFAULT 'Proprietario',
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `anagrafica_persone`
--

LOCK TABLES `anagrafica_persone` WRITE;
/*!40000 ALTER TABLE `anagrafica_persone` DISABLE KEYS */;
INSERT INTO `anagrafica_persone` VALUES (1,1,'EMILIO','D\'Addio','dddmle67h10b963j','3296017027',NULL,'emiliodaddio@virgilio.it','Proprietario',NULL,'2026-10-05 13:49:50'),(2,1,'Pinko','Pallino','PPKKKP83b12B963j','081798454',NULL,'','Proprietario',NULL,'2026-10-05 13:51:48');
/*!40000 ALTER TABLE `anagrafica_persone` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `assemblies`
--

DROP TABLE IF EXISTS `assemblies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assemblies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `condominio_id` int NOT NULL,
  `type` varchar(50) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `date` varchar(50) NOT NULL,
  `time` varchar(50) NOT NULL,
  `location` varchar(255) NOT NULL,
  `agenda` text NOT NULL,
  `meeting_link` varchar(255) DEFAULT NULL,
  `is_past` tinyint(1) DEFAULT '0',
  `minutes_summary` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `assemblies`
--

LOCK TABLES `assemblies` WRITE;
/*!40000 ALTER TABLE `assemblies` DISABLE KEYS */;
/*!40000 ALTER TABLE `assemblies` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_log`
--

DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `condominio_id` int DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `azione` varchar(255) NOT NULL,
  `tabella` varchar(100) DEFAULT NULL,
  `record_id` int DEFAULT NULL,
  `valori_precedenti` text,
  `ip` varchar(100) DEFAULT NULL,
  `timestamp` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=237 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_log`
--

LOCK TABLES `audit_log` WRITE;
/*!40000 ALTER TABLE `audit_log` DISABLE KEYS */;
INSERT INTO `audit_log` VALUES (1,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 13:10:47'),(2,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 13:10:48'),(3,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 13:11:31'),(4,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 13:11:33'),(5,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 13:11:42'),(6,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 13:13:19'),(7,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 13:13:21'),(8,NULL,NULL,'Login Fallito','users',NULL,NULL,'::1','2026-09-30 13:14:24'),(9,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 13:14:27'),(10,NULL,NULL,'Login Fallito','users',NULL,NULL,'::1','2026-09-30 13:14:29'),(11,NULL,NULL,'Login Fallito','users',NULL,NULL,'::1','2026-09-30 13:15:12'),(12,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-09-30 13:16:38'),(13,NULL,2,'Login Fallito (Password)','users',2,NULL,'::1','2026-09-30 13:17:05'),(14,NULL,NULL,'Login Fallito','users',NULL,NULL,'::1','2026-09-30 13:17:36'),(15,NULL,NULL,'Login Fallito','users',NULL,NULL,'::1','2026-09-30 13:17:37'),(16,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 13:18:20'),(17,NULL,NULL,'Login Fallito','users',NULL,NULL,'::1','2026-09-30 13:18:25'),(18,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 13:18:29'),(19,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 13:20:53'),(20,1,2,'Creata Unità Immobiliare','unita_immobiliari',4,NULL,'::1','2026-09-30 13:48:48'),(21,1,2,'Creazione Utente','users',5,NULL,'::1','2026-09-30 14:00:25'),(22,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 14:06:16'),(23,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 14:06:22'),(24,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 14:07:24'),(25,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 14:07:57'),(26,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 14:08:10'),(27,1,2,'Modificata Unità Immobiliare','unita_immobiliari',4,NULL,'::1','2026-09-30 14:08:10'),(28,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 14:08:25'),(29,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 14:11:55'),(30,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 14:14:54'),(31,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 14:15:02'),(32,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 14:26:34'),(33,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 14:54:55'),(34,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 15:02:38'),(35,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 15:03:32'),(36,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 15:06:00'),(37,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-09-30 15:06:06'),(38,1,2,'Inserimento Conto Bancario','bank_accounts',1,NULL,'::1','2026-10-01 06:35:05'),(39,1,2,'Inserimento Transazione Bancaria','bank_transactions',1,NULL,'::1','2026-10-01 06:37:53'),(40,1,2,'Inserimento Transazione Bancaria','bank_transactions',2,NULL,'::1','2026-10-01 06:38:24'),(41,1,2,'Assegnazione Quota','quotes',3,NULL,'::1','2026-10-01 06:59:29'),(42,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-01 07:00:29'),(43,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-02 07:10:22'),(44,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-02 08:15:15'),(45,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-02 08:15:32'),(46,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-02 12:51:34'),(47,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-02 13:15:27'),(48,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-02 13:20:01'),(49,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-02 13:22:10'),(50,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-02 13:55:05'),(51,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-02 13:55:12'),(52,NULL,2,'Login Fallito (Password)','users',2,NULL,'::1','2026-10-02 14:33:23'),(53,NULL,2,'Login Riuscito','users',2,NULL,'::ffff:127.0.0.1','2026-10-02 14:41:44'),(54,NULL,2,'Login Riuscito','users',2,NULL,'::ffff:127.0.0.1','2026-10-02 14:41:58'),(55,NULL,2,'Login Riuscito','users',2,NULL,'::ffff:127.0.0.1','2026-10-02 14:42:50'),(56,NULL,2,'Login Riuscito','users',2,NULL,'::ffff:127.0.0.1','2026-10-02 14:42:59'),(57,NULL,2,'Login Riuscito','users',2,NULL,'::ffff:127.0.0.1','2026-10-02 14:51:39'),(58,NULL,2,'Login Riuscito','users',2,NULL,'::ffff:127.0.0.1','2026-10-02 14:57:47'),(59,NULL,2,'Login Riuscito','users',2,NULL,'::ffff:127.0.0.1','2026-10-02 14:57:58'),(60,NULL,2,'Login Riuscito','users',2,NULL,'::ffff:127.0.0.1','2026-10-02 15:03:37'),(61,NULL,2,'Login Riuscito','users',2,NULL,'::ffff:127.0.0.1','2026-10-02 15:19:29'),(62,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-02 15:29:38'),(63,NULL,NULL,'Login Fallito','users',NULL,NULL,'::ffff:127.0.0.1','2026-10-02 15:37:02'),(64,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-02 15:38:26'),(65,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-02 15:40:18'),(66,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-02 15:54:01'),(67,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-02 15:55:49'),(68,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-02 15:58:20'),(69,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-02 15:58:44'),(70,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-05 06:44:40'),(71,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-05 06:44:54'),(72,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-05 07:09:08'),(73,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-05 07:12:24'),(74,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-05 07:12:54'),(75,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-05 07:16:22'),(76,NULL,NULL,'Login Fallito','users',NULL,NULL,'::1','2026-10-05 07:17:31'),(77,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-05 07:18:51'),(78,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-05 07:32:30'),(79,1,2,'Creazione Utente','users',6,NULL,'::1','2026-10-05 07:38:57'),(80,NULL,6,'Login Riuscito','users',6,NULL,'::1','2026-10-05 07:39:25'),(81,NULL,6,'Login Riuscito','users',6,NULL,'::1','2026-10-05 07:47:39'),(82,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-05 08:50:25'),(83,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-05 08:58:46'),(84,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-05 09:21:37'),(85,NULL,5,'2FA Attivata','users',5,NULL,'::1','2026-10-05 09:46:22'),(86,NULL,5,'Richiesta 2FA','users',5,NULL,'::1','2026-10-05 09:54:49'),(87,NULL,5,'Richiesta 2FA','users',5,NULL,'::1','2026-10-05 09:55:25'),(88,NULL,5,'Richiesta 2FA','users',5,NULL,'::1','2026-10-05 09:56:05'),(89,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-05 09:59:42'),(90,NULL,5,'Richiesta 2FA','users',5,NULL,'::1','2026-10-05 09:59:53'),(91,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-05 10:00:23'),(92,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-05 10:04:14'),(93,NULL,5,'Richiesta 2FA','users',5,NULL,'::1','2026-10-05 10:04:39'),(94,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-05 10:04:41'),(95,NULL,5,'Richiesta 2FA','users',5,NULL,'::1','2026-10-05 10:04:54'),(96,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-05 10:08:28'),(97,NULL,6,'Login Riuscito','users',6,NULL,'::1','2026-10-05 10:08:37'),(98,NULL,6,'Login Riuscito','users',6,NULL,'::1','2026-10-05 10:10:25'),(99,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-05 10:10:31'),(100,NULL,2,'Login Fallito (Password)','users',2,NULL,'::1','2026-10-05 10:12:57'),(101,NULL,2,'Login Fallito (Password)','users',2,NULL,'::1','2026-10-05 10:13:03'),(102,NULL,2,'Richiesta OTP Login','users',2,NULL,'::1','2026-10-05 10:13:17'),(103,NULL,2,'Richiesta OTP Login','users',2,NULL,'::1','2026-10-05 10:17:36'),(104,NULL,2,'Login Riuscito (con OTP)','users',2,NULL,'::1','2026-10-05 10:17:55'),(105,NULL,6,'Richiesta OTP Login','users',6,NULL,'::1','2026-10-05 10:18:47'),(106,NULL,6,'Login Riuscito (con OTP)','users',6,NULL,'::1','2026-10-05 10:19:05'),(107,NULL,6,'Richiesta OTP Login','users',6,NULL,'::1','2026-10-05 10:35:41'),(108,NULL,6,'Login Riuscito (con OTP)','users',6,NULL,'::1','2026-10-05 10:35:55'),(109,NULL,2,'Richiesta OTP Login','users',2,NULL,'::1','2026-10-05 10:36:46'),(110,NULL,2,'Login Riuscito (con OTP)','users',2,NULL,'::1','2026-10-05 10:36:57'),(111,NULL,2,'Richiesta OTP Login','users',2,NULL,'::1','2026-10-05 10:38:24'),(112,NULL,2,'Login Riuscito (con OTP)','users',2,NULL,'::1','2026-10-05 10:38:38'),(113,NULL,5,'Richiesta OTP Login','users',5,NULL,'::1','2026-10-05 11:18:21'),(114,NULL,5,'Login Riuscito (con OTP)','users',5,NULL,'::1','2026-10-05 11:18:32'),(115,NULL,5,'Richiesta OTP Login','users',5,NULL,'::1','2026-10-05 12:17:46'),(116,NULL,5,'Login Riuscito (con OTP)','users',5,NULL,'::1','2026-10-05 12:17:59'),(117,NULL,2,'Richiesta OTP Login','users',2,NULL,'::1','2026-10-05 12:18:17'),(118,NULL,2,'Login Riuscito (con OTP)','users',2,NULL,'::1','2026-10-05 12:18:29'),(119,NULL,2,'Richiesta OTP Login','users',2,NULL,'::1','2026-10-05 12:21:45'),(120,NULL,2,'Login Riuscito (con OTP)','users',2,NULL,'::1','2026-10-05 12:22:00'),(121,NULL,2,'Richiesta OTP Login','users',2,NULL,'::1','2026-10-05 12:39:48'),(122,NULL,2,'Login Riuscito (con OTP)','users',2,NULL,'::1','2026-10-05 12:39:59'),(123,1,2,'Creata Unità  Immobiliare','unita_immobiliari',5,NULL,'::1','2026-10-05 13:22:11'),(124,NULL,2,'Richiesta OTP Login','users',2,NULL,'::1','2026-10-05 13:39:33'),(125,NULL,2,'Login Riuscito (con OTP)','users',2,NULL,'::1','2026-10-05 13:39:42'),(126,NULL,2,'Richiesta OTP Login','users',2,NULL,'::1','2026-10-05 14:06:18'),(127,NULL,2,'Login Riuscito (con OTP)','users',2,NULL,'::1','2026-10-05 14:06:34'),(128,1,2,'Assegnazione Quota','quotes',1,NULL,'::1','2026-10-05 14:17:14'),(129,1,2,'Saldo Quota','quotes',1,NULL,'::1','2026-10-05 14:21:45'),(130,1,2,'Modifica Quota','quotes',1,NULL,'::1','2026-10-05 14:21:54'),(131,NULL,2,'Richiesta OTP Login','users',2,NULL,'::1','2026-10-05 14:50:20'),(132,NULL,2,'Login Riuscito (con OTP)','users',2,NULL,'::1','2026-10-05 14:50:32'),(133,1,2,'Saldo Quota','quotes',1,NULL,'::1','2026-10-05 14:51:46'),(134,1,2,'Modifica Quota','quotes',1,NULL,'::1','2026-10-05 14:52:01'),(135,NULL,5,'Richiesta OTP Login','users',5,NULL,'::1','2026-10-05 14:52:16'),(136,NULL,5,'Login Riuscito (con OTP)','users',5,NULL,'::1','2026-10-05 14:52:27'),(137,NULL,5,'Login Fallito (Password)','users',5,NULL,'::1','2026-10-06 07:04:12'),(138,NULL,2,'Richiesta OTP Login','users',2,NULL,'::1','2026-10-06 07:04:40'),(139,NULL,2,'Login Riuscito (con OTP)','users',2,NULL,'::1','2026-10-06 07:05:15'),(140,NULL,5,'Richiesta OTP Login','users',5,NULL,'::1','2026-10-06 07:06:00'),(141,NULL,5,'Login Riuscito (con OTP)','users',5,NULL,'::1','2026-10-06 07:06:10'),(142,NULL,2,'Login Fallito (Password)','users',2,NULL,'::1','2026-10-06 07:31:04'),(143,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-06 07:32:30'),(144,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-06 07:32:39'),(145,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-06 08:46:06'),(146,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-06 08:46:17'),(147,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-06 09:14:12'),(148,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-06 09:15:04'),(149,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-06 09:25:57'),(150,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-06 09:42:45'),(151,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-06 14:25:01'),(152,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-06 14:25:15'),(153,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 07:17:49'),(154,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 07:28:05'),(155,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 07:51:57'),(156,NULL,3,'Login Fallito (Password)','users',3,NULL,'::1','2026-10-12 07:52:49'),(157,NULL,3,'Login Fallito (Password)','users',3,NULL,'::1','2026-10-12 07:53:01'),(158,NULL,3,'Login Riuscito','users',3,NULL,'::1','2026-10-12 07:53:04'),(159,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 07:53:45'),(160,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 08:01:02'),(161,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 08:25:29'),(162,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 08:25:53'),(163,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 08:27:13'),(164,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 08:28:07'),(165,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 08:28:33'),(166,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 08:42:54'),(167,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 08:49:13'),(168,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-12 08:50:20'),(169,NULL,2,'Login Fallito (Password)','users',2,NULL,'::1','2026-10-12 09:09:35'),(170,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 09:10:00'),(171,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 09:10:23'),(172,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 09:11:33'),(173,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 09:13:26'),(174,NULL,5,'Login Riuscito','users',5,NULL,'::1','2026-10-12 09:13:55'),(175,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-10-12 09:30:51'),(176,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-10-12 09:50:28'),(177,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-10-12 10:04:55'),(178,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-10-12 10:05:47'),(179,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-10-12 10:08:28'),(180,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 10:10:14'),(181,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-10-12 13:40:28'),(182,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-10-12 13:41:49'),(183,2,1,'SuperUser Rilascio Licenza (completo)','condo_licenses',2,'{\"condominioId\":2,\"plan_type\":\"completo\",\"license_status\":\"active\",\"start_date\":\"2026-01-01\",\"end_date\":\"2026-10-01\",\"payment_status\":\"pending\",\"payment_amount\":240,\"payment_reference\":\"Sollecito fattura inviato\",\"payment_date\":\"2026-01-02\",\"max_units\":50,\"notes\":\"Canone Annuale SaaS 2026\",\"sync_modules\":true}','::1','2026-10-12 13:41:51'),(184,NULL,NULL,'Login Fallito','users',NULL,NULL,'::1','2026-10-12 13:41:54'),(185,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 13:44:35'),(186,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-10-12 13:44:40'),(187,2,1,'SuperUser Rilascio Licenza (completo)','condo_licenses',2,'{\"condominioId\":2,\"plan_type\":\"completo\",\"license_status\":\"active\",\"start_date\":\"2026-01-01\",\"end_date\":\"2027-01-01\",\"payment_status\":\"paid\",\"payment_amount\":240,\"payment_reference\":\"Rinnovo SaaS Annuale 2026/2027\",\"payment_date\":\"2026-01-02\",\"max_units\":50,\"notes\":\"Canone Annuale SaaS 2026\",\"sync_modules\":true}','::1','2026-10-12 13:44:44'),(188,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-10-12 13:47:04'),(189,1,1,'SuperUser Rilascio Licenza (completo)','condo_licenses',1,'{\"condominioId\":1,\"plan_type\":\"completo\",\"license_status\":\"active\",\"start_date\":\"2026-01-01\",\"end_date\":\"2026-12-31\",\"payment_status\":\"paid\",\"payment_amount\":240,\"payment_reference\":\"Bonifico CRO 840100\",\"payment_date\":\"2026-01-02\",\"max_units\":50,\"notes\":\"Canone Annuale SaaS 2026\",\"sync_modules\":true}','::1','2026-10-12 13:48:26'),(190,1,1,'SuperUser Rilascio Licenza (completo)','condo_licenses',1,'{\"condominioId\":1,\"plan_type\":\"completo\",\"license_status\":\"suspended\",\"start_date\":\"2026-01-01\",\"end_date\":\"2026-12-31\",\"payment_status\":\"paid\",\"payment_amount\":240,\"payment_reference\":\"Bonifico CRO 840100\",\"payment_date\":\"2026-01-02\",\"max_units\":50,\"notes\":\"Canone Annuale SaaS 2026\",\"sync_modules\":true}','::1','2026-10-12 13:48:46'),(191,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 13:49:06'),(192,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-10-12 14:14:57'),(193,1,1,'SuperUser Rilascio Licenza (completo)','condo_licenses',1,'{\"condominioId\":1,\"plan_type\":\"completo\",\"license_status\":\"suspended\",\"start_date\":\"2026-01-01\",\"end_date\":\"2026-12-31\",\"payment_status\":\"paid\",\"payment_amount\":240,\"payment_reference\":\"Bonifico CRO 840100\",\"payment_date\":\"2026-01-02\",\"max_units\":50,\"notes\":\"Canone Annuale SaaS 2026\",\"sync_modules\":true}','::1','2026-10-12 14:15:01'),(194,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-10-12 14:16:07'),(195,1,1,'SuperUser Rilascio Licenza (completo)','condo_licenses',1,'{\"condominioId\":1,\"plan_type\":\"completo\",\"license_status\":\"suspended\",\"start_date\":\"2026-01-01\",\"end_date\":\"2026-12-31\",\"payment_status\":\"paid\",\"payment_amount\":240,\"payment_reference\":\"Bonifico CRO 840100\",\"payment_date\":\"2026-01-02\",\"max_units\":50,\"notes\":\"Canone Annuale SaaS 2026\",\"sync_modules\":true}','::1','2026-10-12 14:16:11'),(196,1,1,'SuperUser Rilascio Licenza (completo)','condo_licenses',1,'{\"condominioId\":1,\"plan_type\":\"completo\",\"license_status\":\"active\",\"start_date\":\"2026-01-01\",\"end_date\":\"2026-12-31\",\"payment_status\":\"paid\",\"payment_amount\":240,\"payment_reference\":\"Bonifico CRO 840100\",\"payment_date\":\"2026-01-02\",\"max_units\":50,\"notes\":\"Canone Annuale SaaS 2026\",\"sync_modules\":true}','::1','2026-10-12 14:16:20'),(197,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-10-12 14:20:24'),(198,1,1,'SuperUser Rilascio Licenza (completo)','condo_licenses',1,'{\"condominioId\":1,\"plan_type\":\"completo\",\"license_status\":\"suspended\",\"start_date\":\"2026-01-01\",\"end_date\":\"2026-12-31\",\"payment_status\":\"paid\",\"payment_amount\":240,\"payment_reference\":\"Bonifico CRO 840100\",\"payment_date\":\"2026-01-02\",\"max_units\":50,\"notes\":\"Canone Annuale SaaS 2026\",\"sync_modules\":true}','::1','2026-10-12 14:20:28'),(199,1,1,'SuperUser Rilascio Licenza (completo)','condo_licenses',1,'{\"condominioId\":1,\"plan_type\":\"completo\",\"license_status\":\"active\",\"start_date\":\"2026-01-01\",\"end_date\":\"2026-12-31\",\"payment_status\":\"paid\",\"payment_amount\":240,\"payment_reference\":\"Bonifico CRO 840100\",\"payment_date\":\"2026-01-02\",\"max_units\":50,\"notes\":\"Canone Annuale SaaS 2026\",\"sync_modules\":true}','::1','2026-10-12 14:20:38'),(200,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-10-12 14:22:09'),(201,1,1,'SuperUser Rilascio Licenza (completo)','condo_licenses',1,'{\"condominioId\":1,\"plan_type\":\"completo\",\"license_status\":\"suspended\",\"start_date\":\"2026-01-01\",\"end_date\":\"2026-12-31\",\"payment_status\":\"paid\",\"payment_amount\":240,\"payment_reference\":\"Bonifico CRO 840100\",\"payment_date\":\"2026-01-02\",\"max_units\":50,\"notes\":\"Canone Annuale SaaS 2026\",\"sync_modules\":true}','::1','2026-10-12 14:22:50'),(202,NULL,2,'Login Riuscito','users',2,NULL,'::1','2026-10-12 14:22:58'),(203,NULL,3,'Login Riuscito','users',3,NULL,'::1','2026-10-12 14:24:43'),(204,1,1,'SuperUser Rilascio Licenza (completo)','condo_licenses',1,'{\"condominioId\":1,\"plan_type\":\"completo\",\"license_status\":\"active\",\"start_date\":\"2026-01-01\",\"end_date\":\"2026-12-31\",\"payment_status\":\"paid\",\"payment_amount\":240,\"payment_reference\":\"Bonifico CRO 840100\",\"payment_date\":\"2026-01-02\",\"max_units\":50,\"notes\":\"Canone Annuale SaaS 2026\",\"sync_modules\":true}','::1','2026-10-12 14:28:23'),(205,1,1,'SuperUser Rilascio Licenza (completo)','condo_licenses',1,'{\"condominioId\":1,\"plan_type\":\"completo\",\"license_status\":\"active\",\"start_date\":\"2026-01-01\",\"end_date\":\"2026-10-11\",\"payment_status\":\"paid\",\"payment_amount\":240,\"payment_reference\":\"Bonifico CRO 840100\",\"payment_date\":\"2026-01-02\",\"max_units\":50,\"notes\":\"Canone Annuale SaaS 2026\",\"sync_modules\":true}','::1','2026-10-12 14:28:35'),(206,1,1,'SuperUser Rilascio Licenza (completo)','condo_licenses',1,'{\"condominioId\":1,\"plan_type\":\"completo\",\"license_status\":\"active\",\"start_date\":\"2026-01-01\",\"end_date\":\"2026-12-31\",\"payment_status\":\"paid\",\"payment_amount\":240,\"payment_reference\":\"Bonifico CRO 840100\",\"payment_date\":\"2026-01-02\",\"max_units\":50,\"notes\":\"Canone Annuale SaaS 2026\",\"sync_modules\":true}','::1','2026-10-12 14:29:06'),(207,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-10-12 14:41:25'),(208,1,1,'SuperUser Rilascio Licenza (completo)','condo_licenses',1,'{\"condominioId\":1,\"plan_type\":\"completo\",\"license_status\":\"suspended\",\"start_date\":\"2026-01-01\",\"end_date\":\"2026-12-31\",\"payment_status\":\"paid\",\"payment_amount\":240,\"payment_reference\":\"Bonifico CRO 840100\",\"payment_date\":\"2026-01-02\",\"max_units\":50,\"notes\":\"Canone Annuale SaaS 2026\",\"sync_modules\":true}','::1','2026-10-12 14:41:29'),(209,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-10-12 14:42:01'),(210,1,1,'SuperUser Rilascio Licenza (completo)','condo_licenses',1,'{\"condominioId\":1,\"plan_type\":\"completo\",\"license_status\":\"suspended\",\"start_date\":\"2026-01-01\",\"end_date\":\"2026-12-31\",\"payment_status\":\"paid\",\"payment_amount\":240,\"payment_reference\":\"Bonifico CRO 840100\",\"payment_date\":\"2026-01-02\",\"max_units\":50,\"notes\":\"Canone Annuale SaaS 2026\",\"sync_modules\":true}','::1','2026-10-12 14:42:04'),(211,1,1,'SuperUser Aggiornamento Moduli','condo_features',1,'{\"condominioId\":1,\"module_contabilita\":0,\"module_segnalazioni\":1,\"module_assemblee\":1,\"module_comunicazioni\":1,\"module_banca\":1,\"module_anagrafica\":1}','::1','2026-10-12 14:43:57'),(212,1,1,'SuperUser Aggiornamento Moduli','condo_features',1,'{\"condominioId\":1,\"module_contabilita\":1,\"module_segnalazioni\":1,\"module_assemblee\":1,\"module_comunicazioni\":1,\"module_banca\":1,\"module_anagrafica\":1}','::1','2026-10-12 14:44:07'),(213,1,1,'SuperUser Aggiornamento Moduli','condo_features',1,'{\"condominioId\":1,\"module_contabilita\":0,\"module_segnalazioni\":1,\"module_assemblee\":1,\"module_comunicazioni\":1,\"module_banca\":1,\"module_anagrafica\":1}','::1','2026-10-12 14:44:20'),(214,1,1,'SuperUser Aggiornamento Moduli','condo_features',1,'{\"condominioId\":1,\"module_contabilita\":1,\"module_segnalazioni\":1,\"module_assemblee\":1,\"module_comunicazioni\":1,\"module_banca\":1,\"module_anagrafica\":1}','::1','2026-10-12 14:45:33'),(215,NULL,1,'Login Riuscito','users',1,NULL,'::1','2026-10-13 09:12:26'),(216,1,7,'Registrazione Portale','users',7,NULL,'::ffff:127.0.0.1','2026-10-13 09:27:00'),(217,NULL,7,'Login Riuscito','users',7,NULL,'::ffff:127.0.0.1','2026-10-13 09:27:00'),(218,1,9,'Registrazione Portale','users',9,NULL,'::ffff:127.0.0.1','2026-10-13 09:33:13'),(219,NULL,9,'Login Riuscito','users',9,NULL,'::ffff:127.0.0.1','2026-10-13 09:33:13'),(220,NULL,9,'Login Riuscito','users',9,NULL,'::ffff:127.0.0.1','2026-10-13 09:33:14'),(221,NULL,1,'Login Riuscito','users',1,NULL,'::ffff:127.0.0.1','2026-10-13 09:33:39'),(222,NULL,2,'Login Riuscito','users',2,NULL,'::ffff:127.0.0.1','2026-10-13 09:33:39'),(224,2,2,'Assegnazione Utente Esistente','user_condominios',11,NULL,'::ffff:127.0.0.1','2026-10-13 09:33:39'),(227,NULL,1,'Login Riuscito','users',1,NULL,'::ffff:127.0.0.1','2026-10-13 09:35:20'),(228,NULL,2,'Login Riuscito','users',2,NULL,'::ffff:127.0.0.1','2026-10-13 09:35:20'),(230,2,2,'Assegnazione Utente Esistente','user_condominios',13,NULL,'::ffff:127.0.0.1','2026-10-13 09:35:20'),(233,1,15,'Registrazione Portale','users',15,NULL,'::ffff:127.0.0.1','2026-10-13 09:35:34'),(234,NULL,15,'Login Riuscito','users',15,NULL,'::ffff:127.0.0.1','2026-10-13 09:35:34'),(235,NULL,15,'Login Riuscito','users',15,NULL,'::ffff:127.0.0.1','2026-10-13 09:35:35'),(236,NULL,3,'Login Riuscito','users',3,NULL,'::1','2026-10-13 09:36:45');
/*!40000 ALTER TABLE `audit_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bank_accounts`
--

DROP TABLE IF EXISTS `bank_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bank_accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `condominio_id` int NOT NULL,
  `banca` varchar(255) NOT NULL,
  `iban` varchar(50) NOT NULL,
  `intestazione` varchar(255) NOT NULL,
  `note` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bank_accounts`
--

LOCK TABLES `bank_accounts` WRITE;
/*!40000 ALTER TABLE `bank_accounts` DISABLE KEYS */;
INSERT INTO `bank_accounts` VALUES (1,1,'banca','it30000000','condominio mam','','2026-10-01 06:35:05');
/*!40000 ALTER TABLE `bank_accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bank_transactions`
--

DROP TABLE IF EXISTS `bank_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bank_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `account_id` int NOT NULL,
  `data` varchar(50) NOT NULL,
  `importo` double NOT NULL,
  `causale` varchar(255) NOT NULL,
  `tipo` varchar(50) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bank_transactions`
--

LOCK TABLES `bank_transactions` WRITE;
/*!40000 ALTER TABLE `bank_transactions` DISABLE KEYS */;
INSERT INTO `bank_transactions` VALUES (1,1,'2026-10-01',100,'bonifico pinko pallin','Entrata','2026-10-01 06:37:53'),(2,1,'2026-10-01',1000,'bonifico pinko pallin','Entrata','2026-10-01 06:38:24');
/*!40000 ALTER TABLE `bank_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `condo_features`
--

DROP TABLE IF EXISTS `condo_features`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `condo_features` (
  `condominio_id` int NOT NULL,
  `module_contabilita` tinyint(1) DEFAULT '1',
  `module_segnalazioni` tinyint(1) DEFAULT '1',
  `module_assemblee` tinyint(1) DEFAULT '1',
  `module_comunicazioni` tinyint(1) DEFAULT '1',
  `module_banca` tinyint(1) DEFAULT '1',
  `module_anagrafica` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`condominio_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `condo_features`
--

LOCK TABLES `condo_features` WRITE;
/*!40000 ALTER TABLE `condo_features` DISABLE KEYS */;
INSERT INTO `condo_features` VALUES (1,1,1,1,1,1,1),(2,1,1,1,1,1,1);
/*!40000 ALTER TABLE `condo_features` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `condo_licenses`
--

DROP TABLE IF EXISTS `condo_licenses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `condo_licenses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `condominio_id` int NOT NULL,
  `plan_type` varchar(50) DEFAULT 'completo',
  `license_status` varchar(50) DEFAULT 'active',
  `start_date` varchar(50) NOT NULL,
  `end_date` varchar(50) NOT NULL,
  `payment_status` varchar(50) DEFAULT 'paid',
  `payment_reference` varchar(255) DEFAULT NULL,
  `payment_amount` double DEFAULT '240',
  `payment_date` varchar(50) DEFAULT NULL,
  `max_units` int DEFAULT '50',
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `condominio_id` (`condominio_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `condo_licenses`
--

LOCK TABLES `condo_licenses` WRITE;
/*!40000 ALTER TABLE `condo_licenses` DISABLE KEYS */;
INSERT INTO `condo_licenses` VALUES (1,1,'completo','active','2026-01-01','2026-12-31','paid','Bonifico CRO 840100',240,'2026-01-02',50,'Canone Annuale SaaS 2026','2026-10-12 13:36:33','2026-10-12 14:42:04'),(2,2,'completo','active','2026-01-01','2027-01-01','paid','Rinnovo SaaS Annuale 2026/2027',240,'2026-01-02',50,'Canone Annuale SaaS 2026','2026-10-12 13:36:33','2026-10-12 13:44:44');
/*!40000 ALTER TABLE `condo_licenses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `condominios`
--

DROP TABLE IF EXISTS `condominios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `condominios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(255) NOT NULL,
  `indirizzo` varchar(255) NOT NULL,
  `cf` varchar(50) DEFAULT NULL,
  `scala` varchar(50) DEFAULT NULL,
  `piano` varchar(50) DEFAULT NULL,
  `admin_nome` varchar(255) DEFAULT NULL,
  `admin_cognome` varchar(255) DEFAULT NULL,
  `admin_titolo` varchar(100) DEFAULT NULL,
  `admin_telefono` varchar(50) DEFAULT NULL,
  `admin_cellulare` varchar(50) DEFAULT NULL,
  `admin_emergenze` varchar(100) DEFAULT NULL,
  `admin_email` varchar(255) DEFAULT NULL,
  `admin_pec` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `condominios`
--

LOCK TABLES `condominios` WRITE;
/*!40000 ALTER TABLE `condominios` DISABLE KEYS */;
INSERT INTO `condominios` VALUES (1,'Condominio Ma.Ca.','Via Vittorio Alfieri, 4 - 81020 San Nicola la Strada (Ce)','Codice fiscale 123456789','Scale A e B',NULL,'Tizio','Caio','Avv.','018890192456','3357985406','34879512689','test@gmail.com','test@pec.it','2026-09-29 14:54:32'),(2,'Condominio I Pini','Via Milano 2','90087654321',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-09-29 14:54:32');
/*!40000 ALTER TABLE `condominios` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `convocations_log`
--

DROP TABLE IF EXISTS `convocations_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `convocations_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `condominio_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `destinatario` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `data_invio` datetime DEFAULT CURRENT_TIMESTAMP,
  `preview_url` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `convocations_log`
--

LOCK TABLES `convocations_log` WRITE;
/*!40000 ALTER TABLE `convocations_log` DISABLE KEYS */;
INSERT INTO `convocations_log` VALUES (1,1,5,'ELEONORA FINELLI','eleonorafinelli@virgilio.it','2026-10-02 15:04:12','https://ethereal.email/message/ar.HpwLEqXPhdse5ar.H7Fz99noLc1VDAAAAARRM7kRts7UwxtIDcoABRXk'),(2,1,5,'COMUNICAZIONE: Avviso lavori','eleonorafinelli@virgilio.it','2026-10-02 15:20:40','https://ethereal.email/message/ar.JwQLEqXPhdvx9ar.LycAYPlgYh2opAAAAAbE245VPdjXpYmBHGwhSzF0'),(3,0,3,'Reset Password','mario@email.it','2026-10-05 08:20:45','https://ethereal.email/message/asNd1WYKViDlNGKPasNd3cAYPlgYiFQXAAAAAYEunFConS5cUbMRGCrinIk'),(4,0,6,'Reset Password','emiliodaddio@virgilio.it','2026-10-05 08:21:07','https://ethereal.email/message/asNd1WYKViDlNGKPasNd87JrKujo8psgAAAAAkaxD8VNBxbfY7tZOj.2pn8'),(5,0,6,'Reset Password','emiliodaddio@virgilio.it','2026-10-05 08:23:53','https://ethereal.email/message/asNedWYKViDlNHcIasNemcAYPlgYiFQ8AAAAAbV3widqT-Nw4Wq9lITHWuE'),(6,0,6,'Reset Password','emiliodaddio@virgilio.it','2026-10-05 08:28:19','https://ethereal.email/message/asNfRWYKViDlNI3XasNfo7JrKujo8pusAAAAASAbLcq2LI799MiOGRfvF3Y'),(7,0,6,'Reset Password','emiliodaddio@virgilio.it','2026-10-05 08:30:42','https://ethereal.email/message/asNfRWYKViDlNI3XasNgM50L.yTpAP9uAAAAAnZ2OfFr48faSVcyVwHtRZw'),(8,1,3,'RICEVUTA: Mario Rossi','mario@email.it','2026-10-05 08:56:57','https://ethereal.email/message/asNh22YKViDlNNJvasNmWp0L.yTpAQI5AAAAAZF7cFvK0ZuAdTq4bnbezSc'),(9,1,5,'SOLLECITO: ELEONORA FINELLI','eleonorafinelli@virgilio.it','2026-10-05 09:07:11','https://ethereal.email/message/asNh22YKViDlNNJvasNov1z99noLdEasAAAAAmg-hx-bnVE9QY63nU6dV4A'),(10,1,5,'SOLLECITO: ELEONORA FINELLI','eleonorafinelli@virgilio.it','2026-10-05 09:20:04','https://ethereal.email/message/asNrL26yP11Z52lVasNrxFz99noLdEf5AAAAAd5yHr5VsHFvA4TNZ710Yl0');
/*!40000 ALTER TABLE `convocations_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `journal_entries`
--

DROP TABLE IF EXISTS `journal_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `journal_entries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `condominio_id` int NOT NULL,
  `data` varchar(50) NOT NULL,
  `numero` varchar(50) DEFAULT NULL,
  `tipo` varchar(100) NOT NULL,
  `descrizione` text NOT NULL,
  `dare` double DEFAULT '0',
  `avere` double DEFAULT '0',
  `conto` varchar(100) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `journal_entries`
--

LOCK TABLES `journal_entries` WRITE;
/*!40000 ALTER TABLE `journal_entries` DISABLE KEYS */;
INSERT INTO `journal_entries` VALUES (3,1,'2026-09-30','1','Generica','QUOTA CONDOMINIALE',62,0,'ELEONORA FINELLI','2026-09-30 14:42:49'),(4,1,'2026-10-02','1','Generica','134 del 25/6/2026',0,501,'elettricista 1','2026-10-02 08:04:03'),(5,1,'2026-10-06','1','Generica','Fotocopie',0,1.5,'Scontrino','2026-10-06 09:34:24');
/*!40000 ALTER TABLE `journal_entries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `quotes`
--

DROP TABLE IF EXISTS `quotes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quotes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `condominio_id` int NOT NULL,
  `persona_id` int DEFAULT NULL,
  `unita_id` int DEFAULT NULL,
  `type` varchar(50) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `due_date` varchar(50) NOT NULL,
  `amount` double NOT NULL,
  `description` text,
  `status` varchar(50) DEFAULT 'In sospeso',
  `payment_date` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `quotes`
--

LOCK TABLES `quotes` WRITE;
/*!40000 ALTER TABLE `quotes` DISABLE KEYS */;
INSERT INTO `quotes` VALUES (1,1,1,4,'ordinaria','RATA ORDINARIA OTTOBRE 2026','2026-10-05',62,'','Pagato','2026-10-06','2026-10-05 14:17:14');
/*!40000 ALTER TABLE `quotes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `security_logs`
--

DROP TABLE IF EXISTS `security_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `security_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `action` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `security_logs`
--

LOCK TABLES `security_logs` WRITE;
/*!40000 ALTER TABLE `security_logs` DISABLE KEYS */;
INSERT INTO `security_logs` VALUES (1,3,'Richiesta reset (Email di test inviata: <a href=\"https://ethereal.email/message/asNg42YKViDlNLf7asNhP8AYPlgYiFS4AAAAAShf480uqVl242y91j46hFU\" target=\"_blank\" class=\"text-blue-500 underline\">Apri Email</a>)','2026-10-05 08:35:11'),(2,7,'Registrazione completata sul portale','2026-10-13 09:27:00'),(3,9,'Registrazione completata sul portale','2026-10-13 09:33:13'),(4,9,'Ha reimpostato la password autonomamente','2026-10-13 09:33:14'),(5,9,'Richiesta reset (Email di test inviata: <a href=\"https://ethereal.email/message/as3dyG8uLh9DKnOIas3eu1z99noLd3eTAAAAAQqARIMX8ENzXVoXkeoXw4Q\" target=\"_blank\" class=\"text-blue-500 underline\">Apri Email</a>)','2026-10-13 09:33:15'),(6,15,'Registrazione completata sul portale','2026-10-13 09:35:34'),(7,15,'Ha reimpostato la password autonomamente','2026-10-13 09:35:35'),(8,15,'Richiesta reset (Email di test inviata: <a href=\"https://ethereal.email/message/as3fJ28uLh9DKpYias3fSMAYPlgYi43vAAAAAVTxA4-WFkFIIe5WD.g0NAk\" target=\"_blank\" class=\"text-blue-500 underline\">Apri Email</a>)','2026-10-13 09:35:36');
/*!40000 ALTER TABLE `security_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `supplier_payments`
--

DROP TABLE IF EXISTS `supplier_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `supplier_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `condominio_id` int NOT NULL,
  `supplier_name` varchar(255) NOT NULL,
  `category` varchar(100) NOT NULL,
  `invoice_number` varchar(100) DEFAULT NULL,
  `amount` double NOT NULL,
  `payment_date` varchar(50) NOT NULL,
  `status` varchar(50) DEFAULT 'Da liquidare',
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `supplier_payments`
--

LOCK TABLES `supplier_payments` WRITE;
/*!40000 ALTER TABLE `supplier_payments` DISABLE KEYS */;
INSERT INTO `supplier_payments` VALUES (1,1,'La veloce tutto lind srl','Pulizia Scale','1257',250,'2026-09-30','Pagato','','2026-10-05 13:03:53');
/*!40000 ALTER TABLE `supplier_payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `suppliers`
--

DROP TABLE IF EXISTS `suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suppliers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `condominio_id` int NOT NULL,
  `ragione_sociale` varchar(255) NOT NULL,
  `partita_iva` varchar(50) DEFAULT NULL,
  `codice_fiscale` varchar(50) DEFAULT NULL,
  `indirizzo` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  `iban` varchar(50) DEFAULT NULL,
  `note` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `suppliers`
--

LOCK TABLES `suppliers` WRITE;
/*!40000 ALTER TABLE `suppliers` DISABLE KEYS */;
INSERT INTO `suppliers` VALUES (1,1,'La veloce tutto lind srl','0158945221444','dddfrc85b62f839c','Via dei Matti, n° 0','','','','','2026-10-01 06:55:59');
/*!40000 ALTER TABLE `suppliers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ticket_attachments`
--

DROP TABLE IF EXISTS `ticket_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ticket_attachments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticket_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `filename` varchar(255) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `mimetype` varchar(100) NOT NULL,
  `size` int NOT NULL,
  `uploaded_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ticket_attachments`
--

LOCK TABLES `ticket_attachments` WRITE;
/*!40000 ALTER TABLE `ticket_attachments` DISABLE KEYS */;
INSERT INTO `ticket_attachments` VALUES (1,1,5,'1790838878701-88109973.mp4','Tempi Caricamento SDO.mp4','video/mp4',20385591,'2026-10-01 07:14:38');
/*!40000 ALTER TABLE `ticket_attachments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ticket_updates`
--

DROP TABLE IF EXISTS `ticket_updates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ticket_updates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticket_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `author_name` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ticket_updates`
--

LOCK TABLES `ticket_updates` WRITE;
/*!40000 ALTER TABLE `ticket_updates` DISABLE KEYS */;
INSERT INTO `ticket_updates` VALUES (1,2,2,'Studio Rossi','Entro la giornata sarà chiamato l\'idraulico.','2026-10-05 09:28:52'),(2,2,2,'Studio Rossi','Intervento confermato: tecnico idraulico in arrivo entro le ore 15:00.','2026-10-12 09:10:00'),(3,2,2,'Studio Rossi','Stato modificato da \"Segnalato\" a \"In lavorazione\"','2026-10-12 09:10:00'),(4,2,2,'Studio Rossi','Riscontro Amministratore: confermato intervento con tecnico idraulico per completamento riparazione.','2026-10-12 09:11:38'),(5,2,2,'Studio Rossi','Stato modificato da \"In lavorazione\" a \"Chiuso\"','2026-10-12 09:13:43');
/*!40000 ALTER TABLE `ticket_updates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tickets`
--

DROP TABLE IF EXISTS `tickets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tickets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `condominio_id` int NOT NULL,
  `user_id` int NOT NULL,
  `category` varchar(100) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `priority` varchar(50) DEFAULT 'Media',
  `status` varchar(50) DEFAULT 'Segnalato',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tickets`
--

LOCK TABLES `tickets` WRITE;
/*!40000 ALTER TABLE `tickets` DISABLE KEYS */;
INSERT INTO `tickets` VALUES (1,1,5,'Altro','Cancello Carraio bloccato','Il cancello scorrevole dell\'ingresso al garage è bloccato','Urgente','Chiuso','2026-10-01 07:09:01','2026-10-01 07:09:01'),(2,1,5,'Idraulica','Lavatoio Garage','Il lavatoio del garage risulta bloccato e non scarica','Alta','Chiuso','2026-10-05 09:22:54','2026-10-12 09:13:43');
/*!40000 ALTER TABLE `tickets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `unita_immobiliari`
--

DROP TABLE IF EXISTS `unita_immobiliari`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `unita_immobiliari` (
  `id` int NOT NULL AUTO_INCREMENT,
  `condominio_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `tipo` varchar(100) DEFAULT 'Appartamento',
  `identificativo` varchar(100) NOT NULL,
  `scala` varchar(50) DEFAULT NULL,
  `piano` varchar(50) DEFAULT NULL,
  `millesimi_proprieta` double DEFAULT '0',
  `millesimi_scale` double DEFAULT '0',
  `millesimi_ascensore` double DEFAULT '0',
  `proprietario_id` int DEFAULT NULL,
  `conduttore_id` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `unita_immobiliari`
--

LOCK TABLES `unita_immobiliari` WRITE;
/*!40000 ALTER TABLE `unita_immobiliari` DISABLE KEYS */;
INSERT INTO `unita_immobiliari` VALUES (1,1,3,'Appartamento','Int. 1',NULL,NULL,250,0,0,NULL,NULL,'2026-09-30 13:24:10'),(2,2,4,'Appartamento','Int. 10',NULL,NULL,150,0,0,NULL,NULL,'2026-09-30 13:24:10'),(3,1,4,'Appartamento','Int. 2',NULL,NULL,300.5,0,0,NULL,NULL,'2026-09-30 13:24:10'),(4,1,5,'Appartamento','6','A','3',10,10,10,NULL,NULL,'2026-09-30 13:48:48'),(5,1,6,'Appartamento','6','A','3',43,32,31,NULL,NULL,'2026-10-05 13:22:11');
/*!40000 ALTER TABLE `unita_immobiliari` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_condominios`
--

DROP TABLE IF EXISTS `user_condominios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_condominios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `condominio_id` int NOT NULL,
  `role` varchar(50) NOT NULL,
  `unita` varchar(100) DEFAULT NULL,
  `dati_catastali` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_condo` (`user_id`,`condominio_id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_condominios`
--

LOCK TABLES `user_condominios` WRITE;
/*!40000 ALTER TABLE `user_condominios` DISABLE KEYS */;
INSERT INTO `user_condominios` VALUES (1,2,1,'admin','Ufficio',NULL),(2,2,2,'admin','Ufficio',NULL),(3,3,1,'condomino','Int. 1',NULL),(4,4,1,'condomino','Int. 2',NULL),(5,4,2,'condomino','Int. 10',NULL),(6,5,1,'condomino','Scala A - Int. 6 - Piano 3°',''),(7,6,1,'condomino','Scala A - Int. 6 - Piano 3°',NULL),(8,7,1,'condomino','Scala A - Int. 12',NULL);
/*!40000 ALTER TABLE `user_condominios` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `is_superadmin` tinyint(1) DEFAULT '0',
  `two_factor_secret` varchar(255) DEFAULT NULL,
  `two_factor_enabled` tinyint(1) DEFAULT '0',
  `backup_codes` text,
  `telefono` varchar(50) DEFAULT NULL,
  `privacy_accepted` tinyint(1) DEFAULT '0',
  `privacy_accepted_at` datetime DEFAULT NULL,
  `reset_token` varchar(255) DEFAULT NULL,
  `reset_token_expires` bigint DEFAULT NULL,
  `otp_code` varchar(20) DEFAULT NULL,
  `otp_expires` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Super Admin','super@condominio.it','$2b$10$jhsHbbZF3owPE07NIPMNBeS7OTzCS7UQJVvC13rmC6vRHZU/0U65m',1,NULL,0,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'2026-09-29 14:54:32'),(2,'Studio Rossi','admin@condominio.it','$2b$10$jhsHbbZF3owPE07NIPMNBeS7OTzCS7UQJVvC13rmC6vRHZU/0U65m',0,'OBSC6YZJKQ6GCOTRKV4EESCIIZFDGIZRFIXE2NJ4MMWEQ7LJLVYQ',0,'[\"C1VWJFF7\",\"QPT37VGJ\",\"QX2B6ES7\",\"5SOZQ0BC\",\"I8MBLU22\"]',NULL,0,NULL,NULL,NULL,NULL,NULL,'2026-09-29 14:54:32'),(3,'Mario Rossi','mario@email.it','$2b$10$3hXOB6AzQVmUiSS.57pGYu77ex4U66QAol0kDlluKURIuOTwdl5sy',0,NULL,0,NULL,NULL,1,'2026-10-12 07:53:21','3bbbe9d71b420de916f7195f44606480073f452cca3b17d6de076e3f1dba4375',1791192909885,NULL,NULL,'2026-09-29 14:54:32'),(4,'Luigi Verdi','luigi@email.it','$2b$10$3hXOB6AzQVmUiSS.57pGYu77ex4U66QAol0kDlluKURIuOTwdl5sy',0,NULL,0,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'2026-09-29 14:54:32'),(5,'ELEONORA FINELLI','eleonorafinelli@virgilio.it','$2b$10$R7EWNyh0W5/AFK8VDciPhOlt8dGwX2eoCl.9B8VMTo150L3CiYL5e',0,'KVSVORLFNVEXSZLBKBTUSLDBLVBG6RKJMJCEQVKLHA4TQXTXOZUA',0,'[\"LKXVRO83\",\"AHNAKVQQ\",\"WUEHLVO0\",\"6BO6USPZ\",\"REE1C0HU\"]','3296017027',1,'2026-10-02 15:58:24',NULL,NULL,NULL,NULL,'2026-09-30 14:00:24'),(6,'EMILIO D\'ADDIO','emiliodaddio@virgilio.it','$2b$10$D.NPFx4OpY8Vd1tSXbjGQe6jFBua./7vVeMukV2L1Qy2/U3hL36pq',0,'JZOVMV2SFY7VUNK2FJJWCRD5KRZESUZPENGWWL2SNVKD4PB6PNDQ',0,'[\"WTNXB60D\",\"DMU5L2VC\",\"3BVRK6IK\",\"NDD8IGZP\",\"XUPE6XUO\"]','3296017027',1,'2026-10-05 07:39:34','3ca48a3efe45c5ac66a072a9c5e79583dbf3e1a1f4ad4e46ff1fd6235b192ad1',1791192640331,NULL,NULL,'2026-10-05 07:38:57'),(7,'Test Mario Bianchi','test_1791876419935@condominio.it','$2b$10$Y27VLMhxY.IR1FI086Y6jued3t6sj0N5lgx8TaHW7.pde5IZ56Avi',0,NULL,0,NULL,'3471122334',1,'2026-10-13 09:27:00','c90c5366beab40f77310eff997d2515e07f5fe28b6c6b480a3c2e94308ee1164',1791880020192,NULL,NULL,'2026-10-13 09:27:00');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-13  9:45:21
