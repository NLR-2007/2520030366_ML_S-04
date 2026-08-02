# 🚢 Titanic Survival Prediction & Classification Analysis

## 👤 Author Information
- **Name:** Nimma Lokesh Reddy
- **ID:** 2520030366
- **Date:** August 2, 2026
- **Day:** Sunday
- **Time:** 11:30:00 AM IST (+05:30)

---

## 📊 Project Overview
This repository section contains an end-to-end Machine Learning and Exploratory Data Analysis (EDA) project for the classic **Titanic: Machine Learning from Disaster** dataset. The primary goal is to predict passenger survival outcomes based on demographic attributes, socioeconomic class, ticket information, family status, and cabin details.

### 📁 Directory Contents
- **`Titanic-Dataset.csv`**: Raw dataset containing 891 passenger records across 12 feature columns.
- **`Titanic_Survival_Prediction.ipynb`**: Complete Jupyter Notebook featuring data preprocessing, feature engineering, exploratory visualizations, machine learning model training, hyperparameter tuning, and metric evaluation.
- **`images/`**: Directory containing high-resolution visualization charts generated during the analysis (survival breakdown, gender/class correlations, age distributions, correlation matrix, model performance charts, and confusion matrices).
- **`README.md`**: Project documentation and key insights summary.

---

## 📈 Key Exploratory Insights & Findings

1. **Overall Survival Rate**:
   - Total Passengers Analyzed: 891
   - Survived: 342 (~38.4%) | Died: 549 (~61.6%)

2. **Gender Impact ("Women and Children First")**:
   - **Female Survival Rate**: ~74.2%
   - **Male Survival Rate**: ~18.9%
   - Gender proved to be the single strongest predictor of survival.

3. **Socioeconomic Status (Passenger Class - Pclass)**:
   - **1st Class (Pclass 1)**: ~63.0% Survival Rate
   - **2nd Class (Pclass 2)**: ~47.3% Survival Rate
   - **3rd Class (Pclass 3)**: ~24.2% Survival Rate

4. **Family Size & Title Features**:
   - Passengers traveling with small families (family size 2 to 4) had higher survival rates than individuals traveling alone (`IsAlone=1`) or with large families (> 4).
   - Extracted titles (Mrs, Miss, Master, Mr) revealed significant survival variations, with `Master` (young boys) demonstrating a high survival rate (~57.5%).

---

## 🤖 Machine Learning Models & Performance Summary

We evaluated six supervised machine learning algorithms on an 80/20 train-test split:

| Model | Test Accuracy | Precision | Recall | F1-Score |
| :--- | :--- | :--- | :--- | :--- |
| **Random Forest Classifier** | **83.80%** | **81.82%** | **75.36%** | **78.46%** |
| **Gradient Boosting Classifier** | **82.68%** | **80.30%** | **74.63%** | **77.36%** |
| **Support Vector Machine (SVM)** | **81.56%** | **80.00%** | **70.59%** | **75.00%** |
| **Logistic Regression** | **80.45%** | **77.27%** | **72.46%** | **74.78%** |
| **K-Nearest Neighbors (KNN)** | **79.89%** | **76.19%** | **70.59%** | **73.28%** |
| **Decision Tree Classifier** | **77.65%** | **72.31%** | **70.15%** | **71.21%** |

*Random Forest Classifier achieved the highest overall test accuracy (~83.8%) and F1-score.*

---

## 🖼️ Visualizations Showcase

All generated plot images are saved in `images/`:
- `01_survival_distribution.png` - Overall survival pie & bar chart
- `02_survival_by_gender.png` - Gender comparison bar chart
- `03_survival_by_pclass.png` - Passenger class survival chart
- `04_age_distribution_by_survival.png` - Age KDE density plot
- `05_fare_distribution_by_class.png` - Fare vs class boxplot
- `06_survival_by_family_size.png` - Family size survival analysis
- `07_survival_by_title.png` - Title extraction survival rate
- `08_correlation_matrix.png` - Feature correlation heatmap
- `09_model_accuracy_comparison.png` - Model benchmark comparison
- `10_confusion_matrix.png` - Confusion matrix heatmap

---

## 🚀 Execution & Setup
To run the notebook locally:
1. Navigate to `Practical/Titanic-Predection`.
2. Open `Titanic_Survival_Prediction.ipynb` in Jupyter Notebook, VS Code, or Google Colab.
3. Run all cells sequentially to execute preprocessing, model training, and asset generation.
